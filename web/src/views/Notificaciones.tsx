import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type Notificacion = {
  id: string
  title: string
  createdAt: string
  readAt: string | null
}

type ListaNotificaciones = {
  items: Notificacion[]
  unreadCount: number
}

export function VistaNotificaciones() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["notificaciones"],
    queryFn: () => api<ListaNotificaciones>("/notifications?limit=100"),
  })

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ["notificaciones"] })

  const mutarLeer = useMutation({
    mutationFn: (id: string) => api<{ id: string; readAt: string }>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: invalidar,
    onError: (e) => toast.error(e.message),
  })

  const mutarOcultar = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Ocultada")
      invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  const mutarLeerTodas = useMutation({
    mutationFn: () => api<{ updated: number }>("/notifications/read-all", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`${r.updated} marcadas como leídas`)
      invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  const mutarLimpiar = useMutation({
    mutationFn: () => api<{ updated: number }>("/notifications/clear", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`${r.updated} ocultadas`)
      invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Notificaciones</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={mutarLeerTodas.isPending || (data?.unreadCount ?? 0) === 0}
            onClick={() => mutarLeerTodas.mutate()}
          >
            Marcar todas leídas
          </Button>
          <Button
            variant="outline"
            disabled={mutarLimpiar.isPending || (data?.items.length ?? 0) === 0}
            onClick={() => mutarLimpiar.mutate()}
          >
            Ocultar todas
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={data?.unreadCount ? "default" : "secondary"}>
          {data?.unreadCount ?? 0} sin leer
        </Badge>
        <span className="text-sm text-muted-foreground">
          {data?.items.length ?? 0} visibles
        </span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : data?.items.length === 0 ? (
        <p className="text-muted-foreground">Sin notificaciones visibles.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data?.items.map((n) => (
            <Card key={n.id} className={n.readAt ? "opacity-70" : ""}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.readAt && <Badge className="shrink-0">Nueva</Badge>}
                    <p className="truncate text-sm font-medium">{n.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {n.createdAt}
                    {n.readAt && ` · leída ${n.readAt}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!n.readAt || mutarLeer.isPending}
                    onClick={() => mutarLeer.mutate(n.id)}
                  >
                    Leída
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutarOcultar.isPending}
                    onClick={() => mutarOcultar.mutate(n.id)}
                  >
                    Ocultar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
