export type ImageObjectFit =
    "cover" | "contain" | "fill" | "none" | "scale-down";

interface ImgProps {
    src: string;
    classes?: string;
    alt?: string;
    defaultImage?: string;
    loading?: "eager" | "lazy";
    height?: string;
    sizes?: `${string}vw`;
    width?: string;
    borderRadius?: number;
    noDefaultImage?: boolean;
    className?: string;
    objectFit?: ImageObjectFit;
}

const objectFitClass: Record<ImageObjectFit, string> = {
    cover: "object-cover",
    contain: "object-contain",
    fill: "object-fill",
    none: "object-none",
    "scale-down": "object-scale-down",
};

export const Image = (props: ImgProps) => {
    const {
        src,
        alt = "",
        defaultImage,
        loading = "lazy",
        noDefaultImage = false,
        className = "",
        classes = "",
        width = "w-full",
        height = "h-auto",
        objectFit = "cover",
    } = props;
    const source = src || defaultImage;

    if (!source) {
        if (noDefaultImage) return null;
        return (
            <div
                className={`relative ${width} ${height} aspect-video overflow-hidden bg-muted ${classes} ${className}`}
            />
        );
    }

    return (
        <div
            className={`relative ${width} ${height} aspect-video overflow-hidden ${classes} ${className}`}
        >
            <img
                src={source}
                alt={alt}
                loading={loading}
                className={`absolute inset-0 h-full w-full ${objectFitClass[objectFit]}`}
            />
        </div>
    );
};
