export function debounce(fn: (...args: any[]) => void, wait: number) {
    let timeout: ReturnType<typeof setTimeout>;

    return function (...args: any[]) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            fn(...args);
        }, wait);
    };
}
