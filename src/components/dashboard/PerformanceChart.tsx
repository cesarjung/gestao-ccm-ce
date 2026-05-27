import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

interface PerformanceChartProps {
  completed: number;
  pending: number;
  overdue?: number;
  className?: string;
}

export const PerformanceChart = ({ completed, pending, overdue = 0, className }: PerformanceChartProps) => {
  const total = completed + pending + overdue;
  
  const data = [
    { name: 'Concluídas', value: completed, color: 'hsl(142, 76%, 36%)' },
    { name: 'Pendentes', value: pending, color: 'hsl(38, 92%, 50%)' },
    ...(overdue > 0 ? [{ name: 'Atrasadas', value: overdue, color: 'hsl(0, 84%, 60%)' }] : []),
  ].filter(item => item.value > 0);

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-6 shadow-card', className)}>
        <h3 className="font-semibold text-foreground mb-4">Performance Geral</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          Nenhuma tarefa encontrada
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card p-6 shadow-card', className)}>
      <h3 className="font-semibold text-foreground mb-4">Performance Geral</h3>
      
      <div className="h-64 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={4}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(222, 47%, 8%)',
                border: '1px solid hsl(217, 33%, 17%)',
                borderRadius: '0.5rem',
                color: 'hsl(210, 40%, 98%)',
              }}
              formatter={(value: number) => [`${value} tarefas`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-4xl font-bold text-foreground">{percentage}%</p>
            <p className="text-sm text-muted-foreground">concluído</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-muted-foreground">
              {item.name}: <span className="font-medium text-foreground">{item.value}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
