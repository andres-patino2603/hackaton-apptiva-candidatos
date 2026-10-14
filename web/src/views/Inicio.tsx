import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getIdentidad } from "@/lib/api"

function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api<{ ok: boolean }>("/health"),
    refetchInterval: 30000,
  })
}

function usePagosCount() {
  const identidad = getIdentidad()
  return useQuery({
    queryKey: ["pagos-count", identidad],
    queryFn: () =>
      api<{ total: number }>("/pagos/historial?limit=1").then((r) => r.total),
    enabled: ["admin", "analista"].includes(identidad),
    retry: false,
  })
}

function useNotificaciones() {
  return useQuery({
    queryKey: ["notif-count"],
    queryFn: () =>
      api<{ unreadCount: number }>("/notifications?limit=1").then((r) => r.unreadCount),
  })
}

function useCiudades() {
  return useQuery({
    queryKey: ["ciudades-count"],
    queryFn: () => api<unknown[]>("/cities").then((r) => r.length),
  })
}

const TARJETAS = [
  { ruta: "/pagos", titulo: "Pagos", descripcion: "Historial con filtros y paginación" },
  { ruta: "/ciudades", titulo: "Ciudades", descripcion: "Buscador con tildes y país" },
  { ruta: "/notificaciones", titulo: "Notificaciones", descripcion: "Leer, ocultar, marcar todas" },
  { ruta: "/contactos", titulo: "Contactos", descripcion: "Directorio CRUD con historial" },
  { ruta: "/crm", titulo: "CRM", descripcion: "Actividades y tareas comerciales" },
]

export function VistaInicio() {
  const identidad = getIdentidad()
  const health = useHealth()
  const pagos = usePagosCount()
  const notificaciones = useNotificaciones()
  const ciudades = useCiudades()

  const estado = health.data?.ok ? "ok" : health.isError ? "error" : "cargando"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Panel</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Identidad activa:</span>
          <Badge variant="secondary">{identidad}</Badge>
          <Badge variant={estado === "ok" ? "secondary" : "destructive"}>
            backend {estado}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pagos totales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {pagos.data ?? (pagos.isError ? "—" : "...")}
            </p>
            {pagos.isError && (
              <p className="mt-1 text-xs text-muted-foreground">
                Requiere rol admin o analista
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Notificaciones sin leer</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{notificaciones.data ?? "..."}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ciudades visibles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{ciudades.data ?? "..."}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TARJETAS.map((t) => (
          <Link key={t.ruta} to={t.ruta}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardContent className="p-4">
                <p className="font-medium">{t.titulo}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.descripcion}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
