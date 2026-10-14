const IDENTIDADES = ['admin', 'asesor-a', 'asesor-b', 'analista'] as const

export type Identidad = (typeof IDENTIDADES)[number]

export function esIdentidad(valor: string): valor is Identidad {
  return (IDENTIDADES as readonly string[]).includes(valor)
}

export function getIdentidad(): Identidad {
  const guardada = localStorage.getItem('user')
  return guardada && esIdentidad(guardada) ? guardada : 'admin'
}

export function setIdentidad(identidad: Identidad): void {
  localStorage.setItem('user', identidad)
}

export async function api<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: {
      'x-user': getIdentidad(),
      ...(opciones?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opciones?.headers,
    },
  })
  const data = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    const mensaje = (data as { error?: string } | null)?.error ?? `HTTP ${respuesta.status}`
    throw new Error(mensaje)
  }
  return data as T
}
