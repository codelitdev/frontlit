import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { type KeyObject, verify, X509Certificate } from "node:crypto";
import { sesInboundConfig } from "./config";
import { parseRawMime } from "./mime";
import type { NormalizedInboundMail } from "./normalized";

const MAX_CERT_BYTES = 64 * 1024;
const MAX_EMAIL_BYTES = 40 * 1024 * 1024;
const textEncoder = new TextEncoder();

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  SigningCertURL: string;
  Signature: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
};

export class SesInboundError extends Error {
  constructor(
    public kind: "authentication" | "invalid" | "transient" | "configuration",
    message: string,
  ) {
    super(message);
    this.name = "SesInboundError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field) {
    throw new SesInboundError("invalid", `SNS message is missing ${key}`);
  }
  return field;
}

export function parseSnsMessage(rawBody: string): SnsMessage {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new SesInboundError("invalid", "SNS body is not JSON");
  }
  if (!isRecord(body)) throw new SesInboundError("invalid", "SNS body is not JSON");
  const type = requiredString(body, "Type");
  if (
    type !== "Notification" &&
    type !== "SubscriptionConfirmation" &&
    type !== "UnsubscribeConfirmation"
  ) {
    throw new SesInboundError("invalid", "Unsupported SNS message type");
  }
  const message: SnsMessage = {
    Type: type,
    MessageId: requiredString(body, "MessageId"),
    TopicArn: requiredString(body, "TopicArn"),
    Message: requiredString(body, "Message"),
    Timestamp: requiredString(body, "Timestamp"),
    SignatureVersion: requiredString(body, "SignatureVersion"),
    SigningCertURL: requiredString(body, "SigningCertURL"),
    Signature: requiredString(body, "Signature"),
  };
  if (typeof body.Subject === "string") message.Subject = body.Subject;
  if (typeof body.Token === "string") message.Token = body.Token;
  if (typeof body.SubscribeURL === "string") {
    message.SubscribeURL = body.SubscribeURL;
  }
  return message;
}

export function buildSnsSigningString(message: SnsMessage): string {
  const fields =
    message.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : [
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ];
  return fields
    .flatMap((field) => {
      const value = message[field as keyof SnsMessage];
      return field === "Subject" && value === undefined
        ? []
        : [field, String(value ?? "")];
    })
    .join("\n");
}

function assertTrustedSnsHost(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SesInboundError("authentication", "SNS URL is invalid");
  }
  const trusted = /^sns\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/.test(url.hostname);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !trusted
  ) {
    throw new SesInboundError("authentication", "SNS URL is not trusted");
  }
  return url;
}

async function getSnsSigningKey(signingCertUrl: string): Promise<KeyObject> {
  const url = assertTrustedSnsHost(signingCertUrl);
  if (!url.pathname.endsWith(".pem")) {
    throw new SesInboundError(
      "authentication",
      "SNS signing certificate URL is not trusted",
    );
  }
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new SesInboundError(
      "transient",
      "Unable to retrieve the SNS signing certificate",
    );
  }
  const certificate = await response.text();
  if (Buffer.byteLength(certificate) > MAX_CERT_BYTES) {
    throw new SesInboundError(
      "authentication",
      "SNS signing certificate is unexpectedly large",
    );
  }
  return new X509Certificate(certificate).publicKey;
}

export async function verifySnsMessage(
  message: SnsMessage,
  getSigningKey: (url: string) => Promise<KeyObject> = getSnsSigningKey,
): Promise<void> {
  const config = sesInboundConfig();
  if (!config) {
    throw new SesInboundError(
      "configuration",
      "EMAIL_SES_TOPIC_ARN, EMAIL_SES_BUCKET, and EMAIL_SES_REGION are required",
    );
  }
  if (message.TopicArn !== config.topicArn) {
    throw new SesInboundError(
      "authentication",
      "SNS message was not published by the expected topic",
    );
  }
  if (message.SignatureVersion !== "2") {
    throw new SesInboundError("authentication", "SNS SignatureVersion 2 is required");
  }
  const signature = Uint8Array.from(Buffer.from(message.Signature, "base64"));
  if (!signature.length) {
    throw new SesInboundError("authentication", "SNS signature is invalid");
  }
  const signingKey = await getSigningKey(message.SigningCertURL);
  const signingString = buildSnsSigningString(message);
  const valid =
    verify("RSA-SHA256", textEncoder.encode(signingString), signingKey, signature) ||
    verify(
      "RSA-SHA256",
      textEncoder.encode(`${signingString}\n`),
      signingKey,
      signature,
    );
  if (!valid) {
    throw new SesInboundError("authentication", "SNS message signature is invalid");
  }
}

export function assertTrustedSubscribeUrl(value: string): URL {
  const url = assertTrustedSnsHost(value);
  if (url.searchParams.get("Action") !== "ConfirmSubscription") {
    throw new SesInboundError(
      "authentication",
      "SNS subscription confirmation URL is not trusted",
    );
  }
  return url;
}

const s3Clients = new Map<string, S3Client>();

async function getS3Object(bucket: string, key: string, region: string) {
  let client = s3Clients.get(region);
  if (!client) {
    client = new S3Client({ region });
    s3Clients.set(region, client);
  }
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body || typeof result.Body.transformToByteArray !== "function") {
    throw new SesInboundError("transient", "S3 object had no readable body");
  }
  const body = await result.Body.transformToByteArray();
  if (body.byteLength > MAX_EMAIL_BYTES) {
    throw new SesInboundError("invalid", "SES email object exceeds the supported size");
  }
  return body;
}

export async function mailFromSesNotification(
  messageJson: string,
  fetchObject: typeof getS3Object = getS3Object,
): Promise<NormalizedInboundMail> {
  const config = sesInboundConfig();
  if (!config) {
    throw new SesInboundError("configuration", "SES inbound is not configured");
  }
  let value: unknown;
  try {
    value = JSON.parse(messageJson);
  } catch {
    throw new SesInboundError("invalid", "SES notification is not JSON");
  }
  if (!isRecord(value) || !isRecord(value.receipt) || !isRecord(value.mail)) {
    throw new SesInboundError("invalid", "SES notification is missing receipt data");
  }
  if (typeof value.content === "string" && value.content.trim()) {
    return parseRawMime(value.content);
  }
  const action = isRecord(value.receipt.action) ? value.receipt.action : null;
  const bucket =
    typeof action?.bucketName === "string" ? action.bucketName : config.bucket;
  const key = typeof action?.objectKey === "string" ? action.objectKey : "";
  if (!key) {
    throw new SesInboundError("invalid", "SES notification has no S3 object");
  }
  if (
    config.objectPrefix &&
    key !== config.objectPrefix &&
    !key.startsWith(`${config.objectPrefix}/`)
  ) {
    throw new SesInboundError(
      "authentication",
      "SES object key is outside the configured prefix",
    );
  }
  const raw = await fetchObject(bucket, key, config.region);
  return parseRawMime(Buffer.from(raw).toString("utf8"));
}
