'use client';
import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

type Param = {
    id: number;
    [key: string]: any;
};

type Props = {
    data: Param[];
    headers: string[];
};

export function ParametersTable({ data, headers }: Props) {
    const [tableData, setTableData] = useState(data);
    const [filter, setFilter] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const { toast } = useToast();

    const { opCol, intervalCols, levelCols, visibleHeaders } = useMemo(() => {
        const intervalCols = ['7', '30', '90', '180', '360'];
        const levelColNames: string[] = [];
        
        const levelCols: { name: string, level: 'C'|'N'|'CH' }[] = [
            { name: headers.find(h => h.toLowerCase().includes('contrôler')) || '', level: 'C' },
            { name: headers.find(h => h.toLowerCase().includes('nettoyage')) || '', level: 'N' },
            { name: headers.find(h => h.toLowerCase().includes('changement')) || '', level: 'CH' },
        ].filter(c => c.name).map(c => {
            levelColNames.push(c.name);
            return c;
        });

        const knownCols = new Set(['id', ...intervalCols, ...levelColNames]);
        const opCol = headers.find(h => !knownCols.has(h)) || 'id';

        const visibleHeaders = [opCol, ...intervalCols, ...levelCols.map(l => l.name)];
        
        return { opCol, intervalCols, levelCols, visibleHeaders };
    }, [headers]);


    const handleUpdate = async (id: number, column: string, value: string | null) => {
        setIsUpdating(true);
        try {
            const response = await fetch('/api/update-param', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, column, value }),
            });

            const result = await response.json();

            if (result.success) {
                // Update local state for immediate feedback
                setTableData(prevData =>
                    prevData.map(row =>
                        row.id === id ? { ...row, [column]: value } : row
                    )
                );
                toast({
                    title: 'Succès',
                    description: 'Paramètre mis à jour. Le planning doit être regénéré.',
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Erreur',
                    description: `Impossible de mettre à jour le paramètre : ${result.message}`,
                });
                // Revert optimistic update on error
                setTableData(data);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Erreur',
                description: `Erreur réseau : ${error.message}`,
            });
            // Revert optimistic update on error
            setTableData(data);
        } finally {
            setIsUpdating(false);
        }
    };
    
    const filteredData = useMemo(() => {
        if (!filter) return tableData;
        const lowercasedFilter = filter.toLowerCase();
        return tableData.filter(row => 
            row[opCol]?.toString().toLowerCase().includes(lowercasedFilter)
        );
    }, [tableData, filter, opCol]);


    return (
        <div className="space-y-4">
             <div className="flex items-center justify-between">
                <Input
                    placeholder="Filtrer par opération..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="max-w-sm"
                />
                {isUpdating && <Loader2 className="h-5 w-5 animate-spin" />}
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {visibleHeaders.map(header => (
                                <TableHead key={header}>{header}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.map(row => (
                            <TableRow key={row.id}>
                                <TableCell className="font-medium whitespace-nowrap">{row[opCol]}</TableCell>
                                {intervalCols.map(col => (
                                    <TableCell key={col}>
                                        <Select
                                            value={row[col] ?? 'none'}
                                            onValueChange={(value) => handleUpdate(row.id, col, value === 'none' ? null : value)}
                                            disabled={isUpdating}
                                        >
                                            <SelectTrigger className="w-20">
                                                <SelectValue placeholder="-" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">-</SelectItem>
                                                <SelectItem value="*">*</SelectItem>
                                                <SelectItem value="**">**</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                ))}
                                {levelCols.map(colInfo => (
                                    <TableCell key={colInfo.name} className="text-center">
                                         <Checkbox
                                            checked={row[colInfo.name] === colInfo.level}
                                            onCheckedChange={(checked) => handleUpdate(row.id, colInfo.name, checked ? colInfo.level : null)}
                                            disabled={isUpdating}
                                            aria-label={`Niveau ${colInfo.level}`}
                                        />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
