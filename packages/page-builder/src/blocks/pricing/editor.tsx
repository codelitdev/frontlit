import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { PricingSettings, PricingTier } from "./settings";
import {
  FieldGroup,
  ListField,
  SelectField,
  TextField,
  ToggleField,
  RichTextField,
  TitleLevelField,
} from "../_shared/fields";

const createTier = (): PricingTier => ({
  name: "New plan",
  price: "$0/mo",
  description: "",
  features: [],
  buttonCaption: "Get started",
  buttonAction: "#",
});

export function PricingEditor({
  settings,
  onChange,
}: WidgetEditorProps<PricingSettings>) {
  const update = (partial: Partial<PricingSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Content">
        <TextField
          label="Title"
          hint="Wrap words in *asterisks* to highlight them."
          value={settings.title}
          onChange={(title) => update({ title })}
        />
        <TitleLevelField settings={settings} onChange={update} />
        <RichTextField
          label="Description"
          value={settings.description}
          onChange={(description) => update({ description })}
          showToolbar={false}
          minHeight={80}
        />
        <SelectField
          label="Header alignment"
          value={settings.headerAlignment ?? "center"}
          onChange={(headerAlignment) => update({ headerAlignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ]}
        />
      </FieldGroup>
      <FieldGroup title="Billing period">
        <ToggleField
          label="Monthly/Yearly switch"
          value={settings.pricingSwitcher}
          onChange={(pricingSwitcher) => update({ pricingSwitcher })}
        />
        {settings.pricingSwitcher && (
          <>
            <TextField
              label="Monthly caption"
              value={settings.monthlyPriceCaption}
              placeholder="Monthly"
              onChange={(monthlyPriceCaption) => update({ monthlyPriceCaption })}
            />
            <TextField
              label="Yearly caption"
              value={settings.yearlyPriceCaption}
              placeholder="Yearly (2 months free)"
              onChange={(yearlyPriceCaption) => update({ yearlyPriceCaption })}
            />
            <SelectField
              label="Selected by default"
              value={settings.defaultPeriod ?? "yearly"}
              onChange={(defaultPeriod) => update({ defaultPeriod })}
              options={[
                { label: "Monthly", value: "monthly" },
                { label: "Yearly", value: "yearly" },
              ]}
            />
          </>
        )}
      </FieldGroup>
      <FieldGroup title="Pricing tiers">
        <ListField<PricingTier>
          label="Tiers"
          items={settings.tiers ?? []}
          onChange={(tiers) => update({ tiers })}
          createItem={createTier}
          addLabel="Add tier"
          renderItem={(tier, updateTier, remove) => (
            <>
              <TextField
                label="Name"
                value={tier.name}
                onChange={(name) => updateTier({ name })}
              />
              <TextField
                label={settings.pricingSwitcher ? "Monthly price" : "Price"}
                value={tier.price}
                placeholder="$29/mo"
                onChange={(price) => updateTier({ price })}
              />
              {settings.pricingSwitcher && (
                <TextField
                  label="Yearly price"
                  value={tier.priceYearly}
                  placeholder="$290/year"
                  hint="Leave empty to show the monthly price."
                  onChange={(priceYearly) => updateTier({ priceYearly })}
                />
              )}
              <TextField
                label="Description"
                value={tier.description}
                multiline
                onChange={(description) => updateTier({ description })}
              />
              <TextField
                label="Features (one per line)"
                value={(tier.features ?? []).join("\n")}
                multiline
                onChange={(value) =>
                  updateTier({
                    features: value
                      .split("\n")
                      .map((f) => f.trim())
                      .filter(Boolean),
                  })
                }
              />
              <TextField
                label="Button text"
                value={tier.buttonCaption}
                onChange={(buttonCaption) => updateTier({ buttonCaption })}
              />
              <TextField
                label="Button link"
                value={tier.buttonAction}
                onChange={(buttonAction) => updateTier({ buttonAction })}
              />
              {settings.pricingSwitcher && (
                <TextField
                  label="Yearly button link"
                  value={tier.buttonActionYearly}
                  hint="Leave empty to use the button link."
                  onChange={(buttonActionYearly) => updateTier({ buttonActionYearly })}
                />
              )}
              <ToggleField
                label="Highlight this tier"
                value={tier.highlighted}
                onChange={(highlighted) => updateTier({ highlighted })}
              />
              <button
                type="button"
                className="self-start text-xs font-medium text-destructive hover:underline"
                onClick={remove}
              >
                Remove tier
              </button>
            </>
          )}
        />
      </FieldGroup>
    </div>
  );
}
