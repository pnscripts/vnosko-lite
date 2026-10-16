// Vnosko Lite by PN Scripts (MIT): types.
export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'email' | 'url' | 'phone' | 'enum';
export interface EnumOption { value: string; label?: string; aliases?: string[] }
export interface Field {
  key: string;
  label?: string;
  type?: FieldType;
  required?: boolean;
  unique?: boolean;
  aliases?: string[];
  options?: Array<string | EnumOption>;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  /** The value shown in the downloadable template (otherwise one is made up from the type). */
  example?: string | number;
  /** Return a message to reject the converted value, or null/undefined to accept it. */
  validate?: (value: any) => string | null | undefined | false;
}
export type ErrorCode = 'required' | 'number' | 'integer' | 'min' | 'max' | 'boolean' | 'date' | 'email' | 'url' | 'phone' | 'enum' | 'maxLength' | 'pattern' | 'unique';
export type CellError = ErrorCode | { message: string };
export interface CheckedRow { index: number; values: Record<string, any>; raw: Record<string, string>; errors: Record<string, CellError> }
export interface Sheet { name: string; rows: string[][] }
export type Lang = 'en' | 'bg';
export type Messages = Partial<Record<keyof typeof MESSAGES['en'], string>>;

export function decode(bytes: ArrayBuffer | Uint8Array, fallback?: string): string;
export function sniffDelimiter(text: string): string;
export function parseCSV(text: string, delimiter?: string): string[][];
export function unzip(buffer: ArrayBuffer | Uint8Array): Promise<{ names: string[]; text(name: string): Promise<string | null> }>;
export function excelDate(serial: number): string;
export function parseXLSX(buffer: ArrayBuffer | Uint8Array): Promise<Sheet[]>;
export function readFile(file: Blob & { name?: string }, options?: { encoding?: string }): Promise<{ name: string; sheets: Sheet[] }>;
export class VnoskoError extends Error { code: string; constructor(code: string) }
export function norm(s: unknown): string;
export function findHeaderRow(rows: string[][], fields: Field[]): number;
export function autoMap(headers: string[], fields: Field[]): Record<string, number>;
export function parseNumber(text: string): number | null;
export function parseDate(text: string, dateOrder?: 'dmy' | 'mdy'): string | null;
export function convert(raw: unknown, field: Field, options?: { dateOrder?: 'dmy' | 'mdy' }): { value: any; error: CellError | null };
export function checkRows(rows: string[][], mapping: Record<string, number>, fields: Field[], options?: { dateOrder?: 'dmy' | 'mdy' }): CheckedRow[];
export const MESSAGES: { en: Record<string, string>; bg: Record<string, string> };
export function message(lang: string, overrides: Record<string, string> | undefined, key: string, vars?: Record<string, unknown>): string;
export function exampleValue(field: Field, options?: { dateOrder?: 'dmy' | 'mdy' }): string;
/** CSV with the field labels as headings and one example row that imports without errors (UTF-8 with BOM). */
export function templateCsv(fields: Field[], options?: { delimiter?: string; example?: boolean; dateOrder?: 'dmy' | 'mdy' }): string;
export function errorText(error: CellError, field: Field, lang: string, overrides?: Record<string, string>): string;
