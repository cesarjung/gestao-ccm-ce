import React, { useState } from 'react';
import { useAlojamentos, Alojamento } from '@/hooks/useAlojamentos';
import { UNIDADES_PLANEJAMENTO } from '@/constants/unidades';
import { Button } from '@/components/ui/button';
import { Home, Trash2, Building2, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export const AlojamentosView = () => {
  const { alojamentos, addAlojamento, removeAlojamento } = useAlojamentos();

  const [unidadeId, setUnidadeId] = useState('');
  const [nome, setNome] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [capacidade, setCapacidade] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!unidadeId || !nome || !latitude || !longitude || !capacidade) {
      setError('Preencha todos os campos.');
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const cap = parseInt(capacidade, 10);

    if (isNaN(lat) || isNaN(lng)) {
      setError('Latitude e Longitude devem ser números válidos.');
      return;
    }

    if (isNaN(cap) || cap < 0) {
      setError('Capacidade deve ser um número válido.');
      return;
    }

    const unidade = UNIDADES_PLANEJAMENTO.find(u => u.id === unidadeId);
    if (!unidade) {
      setError('Unidade inválida.');
      return;
    }

    addAlojamento({
      unidadeId,
      unidadeNome: unidade.nome,
      nome,
      latitude: lat,
      longitude: lng,
      capacidade: cap
    });

    setSuccess('Alojamento cadastrado com sucesso!');
    // Reset form
    setNome('');
    setLatitude('');
    setLongitude('');
    setCapacidade('');
    // Keep unidadeId selected for convenience
    
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-2 bg-primary/10 text-primary rounded-lg">
          <Home className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Gerenciamento de Alojamentos e Bases</h2>
          <p className="text-sm text-muted-foreground">Cadastre os endereços para visualização no mapa de Carteira.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Formulário de Cadastro */}
        <div className="col-span-1 border border-border bg-card rounded-xl shadow-sm p-5 h-fit">
          <h3 className="font-bold text-base mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Novo Cadastro
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unidade</label>
              <select 
                value={unidadeId} 
                onChange={(e) => setUnidadeId(e.target.value)}
                className="w-full bg-background border border-input rounded-md h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Selecione uma Unidade...</option>
                {UNIDADES_PLANEJAMENTO.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome do Local</label>
              <input 
                type="text" 
                value={nome} 
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Alojamento Centro ou Base Barreiras"
                className="w-full bg-background border border-input rounded-md h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Dica: Se contiver a palavra "Base", o mapa usará ícone de fábrica.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latitude</label>
                <input 
                  type="number" 
                  step="any"
                  value={latitude} 
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="-12.12345"
                  className="w-full bg-background border border-input rounded-md h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Longitude</label>
                <input 
                  type="number" 
                  step="any"
                  value={longitude} 
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="-45.12345"
                  className="w-full bg-background border border-input rounded-md h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Capacidade (Pessoas)</label>
              <input 
                type="number" 
                min="0"
                value={capacidade} 
                onChange={(e) => setCapacidade(e.target.value)}
                placeholder="Ex: 15"
                className="w-full bg-background border border-input rounded-md h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {error && <div className="text-xs text-red-500 font-medium p-2 bg-red-500/10 rounded">{error}</div>}
            {success && <div className="text-xs text-green-600 font-medium p-2 bg-green-500/10 rounded">{success}</div>}

            <Button type="submit" className="w-full mt-2">Salvar Cadastro</Button>
          </form>
        </div>

        {/* Lista de Alojamentos */}
        <div className="col-span-1 lg:col-span-2 border border-border bg-card rounded-xl shadow-sm p-0 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-muted/20">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Locais Cadastrados ({alojamentos.length})
            </h3>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar p-0">
            {alojamentos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
                <Home className="w-8 h-8 opacity-20 mb-2" />
                Nenhum local cadastrado ainda.
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/30 sticky top-0 border-b border-border">
                  <tr>
                    <th className="py-3 px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Unidade</th>
                    <th className="py-3 px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Nome</th>
                    <th className="py-3 px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Coordenadas</th>
                    <th className="py-3 px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-center">Vagas</th>
                    <th className="py-3 px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alojamentos.map(aloj => {
                    const isBase = aloj.nome.toLowerCase().includes('base');
                    return (
                      <tr key={aloj.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-medium">{aloj.unidadeNome.replace('UNIDADE ', '')}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {isBase ? <Building2 className="w-3.5 h-3.5 text-blue-500" /> : <Home className="w-3.5 h-3.5 text-green-500" />}
                            <span className="font-semibold">{aloj.nome}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {aloj.latitude.toFixed(5)}, {aloj.longitude.toFixed(5)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
                            {aloj.capacidade}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => removeAlojamento(aloj.id)}
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
