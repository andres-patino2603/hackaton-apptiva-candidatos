import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { VistaCiudades } from "@/views/Ciudades"
import { VistaPagos } from "@/views/Pagos"

const queryClient = new QueryClient()

function Placeholder({ titulo }: { titulo: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-muted-foreground">Vista en construcción.</p>
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Placeholder titulo="Inicio" />} />
            <Route path="ciudades" element={<VistaCiudades />} />
            <Route path="pagos" element={<VistaPagos />} />
            <Route path="notificaciones" element={<Placeholder titulo="Notificaciones" />} />
            <Route path="contactos" element={<Placeholder titulo="Contactos" />} />
            <Route path="crm" element={<Placeholder titulo="CRM" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
