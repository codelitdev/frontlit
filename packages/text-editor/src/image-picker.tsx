"use client";

import { createContext, useContext, type ReactNode } from "react";

export type PickedImage = {
    src: string;
    alt?: string;
};

const ImagePickerContext = createContext<
    (() => Promise<PickedImage | null>) | null
>(null);

export function ImagePickerContextProvider({
    pickImage,
    children,
}: {
    pickImage: () => Promise<PickedImage | null>;
    children: ReactNode;
}) {
    return (
        <ImagePickerContext.Provider value={pickImage}>
            {children}
        </ImagePickerContext.Provider>
    );
}

export function useImagePicker() {
    return useContext(ImagePickerContext);
}
