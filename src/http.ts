import type { Request } from 'express';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function scalar(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new HttpError(400, 'Se requiere un texto único');
  return value;
}
export function integer(value: unknown, fallback: number, min = 1, max = 100): number {
  const text = scalar(value, String(fallback));
  if (!/^\d+$/.test(text)) throw new HttpError(400, 'Entero inválido');
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new HttpError(400, 'Entero fuera de rango');
  return number;
}
const actors = {
  admin: { id: 'admin', role: 'admin', email: 'admin@example.test' },
  'asesor-a': { id: 'asesor-a', role: 'asesor', email: 'a@example.test' },
  'asesor-b': { id: 'asesor-b', role: 'asesor', email: 'b@example.test' },
  analista: { id: 'analista', role: 'analista', email: 'analista@example.test' },
};
export type Actor = (typeof actors)[keyof typeof actors];
export function actor(req: Request): Actor {
  const key = req.get('x-user')?.trim().toLowerCase();
  if (!key || !Object.hasOwn(actors, key)) throw new HttpError(401, 'Usuario de laboratorio requerido');
  return actors[key as keyof typeof actors];
}
