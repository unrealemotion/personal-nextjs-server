/* tslint:disable */
/* eslint-disable */

export class RustExecutionContext {
    free(): void;
    [Symbol.dispose](): void;
    insert(key: string, value: string): void;
    insert_record(record: any): void;
    insert_val_flat(prefix: string, val: any): void;
    interpolate(template: string): string;
    constructor();
}

export function compute_semantic_diff(left_val: any, right_val: any): any;

export function flatten_object(obj_js: any, prefix: string): any;

export function get_json_structure(val_js: any): any;

export function get_shared_value_structure(left_val: any, right_val: any): any;

export function json_to_table_data(json_val: any, options_val: any): any;

export function normalize_json_order(val_js: any, ignore_order: boolean): any;

export function parse_spreadsheet(file_bytes: Uint8Array, extension: string): any;

export function resolve_variables(text: string, variables_map: any, depth_limit: number): string;

export function strip_json_comments(json_str: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_rustexecutioncontext_free: (a: number, b: number) => void;
    readonly compute_semantic_diff: (a: any, b: any) => [number, number, number];
    readonly flatten_object: (a: any, b: number, c: number) => [number, number, number];
    readonly get_json_structure: (a: any) => [number, number, number];
    readonly get_shared_value_structure: (a: any, b: any) => [number, number, number];
    readonly json_to_table_data: (a: any, b: any) => [number, number, number];
    readonly normalize_json_order: (a: any, b: number) => [number, number, number];
    readonly parse_spreadsheet: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly resolve_variables: (a: number, b: number, c: any, d: number) => [number, number, number, number];
    readonly rustexecutioncontext_insert: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rustexecutioncontext_insert_record: (a: number, b: any) => void;
    readonly rustexecutioncontext_insert_val_flat: (a: number, b: number, c: number, d: any) => void;
    readonly rustexecutioncontext_interpolate: (a: number, b: number, c: number) => [number, number];
    readonly rustexecutioncontext_new: () => number;
    readonly strip_json_comments: (a: number, b: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
