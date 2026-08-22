/**
 * Types for the vendoring script, so the drift test can import the real
 * transformation instead of restating it.
 */
export declare const ENGINE_FILES: readonly string[];
export declare const VENDOR_DIR: string;
export declare function vendor(source: string, name: string): string;
export declare function expectedFiles(): Map<string, string>;
