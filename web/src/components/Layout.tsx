import { NavLink, Outlet } from "react-router-dom"
import { getIdentidad, setIdentidad, type Identidad } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/sonner"
import { useState } from "react"

const RUTAS = [
  { ruta: "/", etiqueta: "Inicio" },
  { ruta: "/ciudades", etiqueta: "Ciudades" },
  { ruta: "/pagos", etiqueta: "Pagos" },
  { ruta: "/notificaciones", etiqueta: "Notificaciones" },
  { ruta: "/contactos", etiqueta: "Contactos" },
  { ruta: "/crm", etiqueta: "CRM" },
]

const IDENTIDADES: Identidad[] = ["admin", "asesor-a", "asesor-b", "analista"]

export function Layout() {
  const [identidad, setIdentidadLocal] = useState<Identidad>(getIdentidad)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-border p-4">
        <div className="mb-4 flex items-center gap-2">
          <span className="font-semibold">Apptiva</span>
          <Badge variant="secondary">demo</Badge>
        </div>
        {RUTAS.map((r) => (
          <NavLink
            key={r.ruta}
            to={r.ruta}
            end={r.ruta === "/"}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`
            }
          >
            {r.etiqueta}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          <span className="text-xs text-muted-foreground">Identidad (x-user)</span>
          <Select
            value={identidad}
            onValueChange={(valor) => {
              const id = valor as Identidad
              setIdentidad(id)
              setIdentidadLocal(id)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDENTIDADES.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
