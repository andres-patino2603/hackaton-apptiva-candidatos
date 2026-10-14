import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Ciudad = {
  id: string
  name: string
  ascii: string
  country: string
  countryCode: string
}

function useDebounce<T>(valor: T, ms: number): T {
  const [debounced, setDebounced] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return debounced
}

export function VistaCiudades() {
  const [q, setQ] = useState("")
  const [country, setCountry] = useState("")
  const qDebounced = useDebounce(q, 300)
  const countryDebounced = useDebounce(country, 300)

  const { data = [], isLoading } = useQuery({
    queryKey: ["ciudades", qDebounced, countryDebounced],
    queryFn: () => {
      const params = new URLSearchParams()
      if (qDebounced) params.set("q", qDebounced)
      if (countryDebounced) params.set("country", countryDebounced)
      const qs = params.toString()
      return api<Ciudad[]>(`/cities${qs ? `?${qs}` : ""}`)
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Ciudades</h1>
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nombre o código..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="País (ej: bo, Bol)"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="max-w-xs"
        />
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {data.length} resultado{data.length === 1 ? "" : "s"}
          </p>
          {data.length === 0 && (
            <p className="text-muted-foreground">Sin resultados.</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.country}</p>
                  </div>
                  <Badge variant="outline">{c.countryCode}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
