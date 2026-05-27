import { Calendar, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';

export function GoogleCalendarConnect() {
  const { isConnected, isLoading, isExpired, connect, disconnect } = useGoogleCalendar();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Verificando conexão...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Google Calendar
        </CardTitle>
        <CardDescription>
          Sincronize suas tarefas com o Google Calendar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-amber-500' : 'bg-green-500'}`} />
              <span className={isExpired ? 'text-amber-600' : 'text-green-600'}>
                {isExpired ? 'Conexão expirada' : 'Conectado'}
              </span>
            </div>
            
            {isExpired && (
              <p className="text-sm text-muted-foreground">
                A conexão expirou. Reconecte para continuar sincronizando.
              </p>
            )}

            <div className="flex gap-2">
              {isExpired && (
                <Button onClick={connect} variant="default" size="sm">
                  <Link2 className="mr-2 h-4 w-4" />
                  Reconectar
                </Button>
              )}
              <Button onClick={disconnect} variant="outline" size="sm">
                <Unlink className="mr-2 h-4 w-4" />
                Desconectar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conecte sua conta do Google para sincronizar tarefas automaticamente com seu calendário.
            </p>
            
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Tarefas criadas aqui aparecem no Google Calendar</li>
              <li>• Eventos do Google Calendar podem ser importados como tarefas</li>
              <li>• Atualizações são sincronizadas em ambas as direções</li>
            </ul>

            <Button onClick={connect} className="w-full">
              <Link2 className="mr-2 h-4 w-4" />
              Conectar Google Calendar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
