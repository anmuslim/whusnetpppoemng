import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  ColumnOrderState,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  Columns,
  Download,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Check,
  GripVertical,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { ContextMenu, ContextMenuItem } from './ContextMenu.tsx';

// Comparator for IP addresses (e.g. 10.10.0.2 vs 10.10.0.10)
export function ipAddressComparator(rowA: any, rowB: any, columnId: string) {
  const valA = String(rowA.getValue(columnId) || '');
  const valB = String(rowB.getValue(columnId) || '');

  const numA = valA.split('.').map((p) => parseInt(p, 10));
  const numB = valB.split('.').map((p) => parseInt(p, 10));

  if (numA.length === 4 && numB.length === 4 && !numA.some(isNaN) && !numB.some(isNaN)) {
    for (let i = 0; i < 4; i++) {
      if (numA[i] !== numB[i]) {
        return numA[i] > numB[i] ? 1 : -1;
      }
    }
    return 0;
  }
  return valA.localeCompare(valB);
}

// Comparator for uptime strings (e.g. "3d 4h 12m", "14h 5m", "45m")
export function uptimeComparator(rowA: any, rowB: any, columnId: string) {
  const parseSeconds = (str: string): number => {
    if (!str) return 0;
    let sec = 0;
    const days = str.match(/(\d+)d/);
    const hrs = str.match(/(\d+)h/);
    const mins = str.match(/(\d+)m/);
    const s = str.match(/(\d+)s/);
    if (days) sec += parseInt(days[1], 10) * 86400;
    if (hrs) sec += parseInt(hrs[1], 10) * 3600;
    if (mins) sec += parseInt(mins[1], 10) * 60;
    if (s) sec += parseInt(s[1], 10);
    return sec;
  };

  return parseSeconds(rowA.getValue(columnId)) - parseSeconds(rowB.getValue(columnId));
}

// Comparator for bandwidth rate / numeric limits (e.g. "10M/10M", "100M", "512k")
export function bandwidthComparator(rowA: any, rowB: any, columnId: string) {
  const parseRate = (str: string): number => {
    if (!str) return 0;
    const firstPart = str.split('/')[0].trim();
    const num = parseFloat(firstPart);
    if (isNaN(num)) return 0;
    if (firstPart.toLowerCase().includes('g')) return num * 1000000;
    if (firstPart.toLowerCase().includes('m')) return num * 1000;
    if (firstPart.toLowerCase().includes('k')) return num;
    return num;
  };

  return parseRate(rowA.getValue(columnId)) - parseRate(rowB.getValue(columnId));
}

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  tableId: string;
  searchPlaceholder?: string;
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
  getContextMenuItems?: (row: TData) => ContextMenuItem[];
  isRowDisabled?: (row: TData) => boolean;
  isRowDynamic?: (row: TData) => boolean;
  emptyMessage?: string;
  topToolbarActions?: React.ReactNode;
  renderMobileCard?: (row: TData, isSelected: boolean, onSelect: () => void) => React.ReactNode;
  onSelectionChange?: (selectedRows: TData[]) => void;
  loading?: boolean;
}

export function DataTable<TData extends object>({
  data,
  columns,
  tableId,
  searchPlaceholder = 'Cari (nama, ip, profile, komentar)...',
  getRowId = (row: any) => row.name || row.id || JSON.stringify(row),
  onRowClick,
  onRowDoubleClick,
  getContextMenuItems,
  isRowDisabled,
  isRowDynamic,
  emptyMessage = 'Tidak ada data ditemukan.',
  topToolbarActions,
  renderMobileCard,
  onSelectionChange,
  loading = false,
}: DataTableProps<TData>) {
  // Persistence for column visibility
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const saved = localStorage.getItem(`pppoe_tbl_col_${tableId}`);
    return saved ? JSON.parse(saved) : {};
  });

  // Persistence for column order (draggable / movable columns)
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => {
    const saved = localStorage.getItem(`pppoe_tbl_order_${tableId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [];
  });

  // Drag and drop column state
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [debouncedGlobalFilter, setDebouncedGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageSize, setPageSize] = useState<number>(50);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    isOpen: boolean;
    row: TData | null;
  }>({ x: 0, y: 0, isOpen: false, row: null });

  // Debounce global filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGlobalFilter(globalFilter);
    }, 200);
    return () => clearTimeout(timer);
  }, [globalFilter]);

  // Persist column visibility
  useEffect(() => {
    localStorage.setItem(`pppoe_tbl_col_${tableId}`, JSON.stringify(columnVisibility));
  }, [columnVisibility, tableId]);

  // Persist column order
  useEffect(() => {
    if (columnOrder.length > 0) {
      localStorage.setItem(`pppoe_tbl_order_${tableId}`, JSON.stringify(columnOrder));
    }
  }, [columnOrder, tableId]);

  // Move column left or right programmatically
  const moveColumn = (colId: string, direction: 'left' | 'right') => {
    const leafCols = table.getAllLeafColumns().map((c) => c.id);
    const current = columnOrder.length > 0 ? [...columnOrder] : leafCols;
    const idx = current.indexOf(colId);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= current.length) return;
    const nextOrder = [...current];
    const [moved] = nextOrder.splice(idx, 1);
    nextOrder.splice(targetIdx, 0, moved);
    setColumnOrder(nextOrder);
  };

  // Reset column order to original default
  const resetColumnOrder = () => {
    localStorage.removeItem(`pppoe_tbl_order_${tableId}`);
    setColumnOrder([]);
  };

  // Drop column handler for header drag-and-drop
  const handleColumnDrop = (targetColId: string) => {
    if (!draggedColId || draggedColId === targetColId) {
      setDraggedColId(null);
      setDragOverColId(null);
      setDropSide(null);
      return;
    }
    const leafCols = table.getAllLeafColumns().map((c) => c.id);
    const current = columnOrder.length > 0 ? [...columnOrder] : leafCols;
    const fromIdx = current.indexOf(draggedColId);
    if (fromIdx === -1) return;

    const nextOrder = [...current];
    nextOrder.splice(fromIdx, 1);

    let toIdx = nextOrder.indexOf(targetColId);
    if (toIdx === -1) {
      toIdx = nextOrder.length;
    } else if (dropSide === 'right') {
      toIdx += 1;
    }

    nextOrder.splice(toIdx, 0, draggedColId);
    setColumnOrder(nextOrder);
    setDraggedColId(null);
    setDragOverColId(null);
    setDropSide(null);
  };

  // Handle Ctrl+A for selecting all visible rows
  const tableContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        const allSelected: RowSelectionState = {};
        table.getRowModel().rows.forEach((r) => {
          allSelected[r.id] = true;
        });
        setRowSelection(allSelected);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: debouncedGlobalFilter,
      columnFilters,
      columnVisibility,
      columnOrder,
      rowSelection,
    },
    enableRowSelection: true,
    getRowId,
    onSortingChange: setSorting,
    onGlobalFilterChange: setDebouncedGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  // Keep page size synced
  useEffect(() => {
    table.setPageSize(pageSize);
  }, [pageSize, table]);

  // Sync selected rows to parent callback
  useEffect(() => {
    if (onSelectionChange) {
      const selected = table.getSelectedRowModel().rows.map((r) => r.original);
      onSelectionChange(selected);
    }
  }, [rowSelection, data, onSelectionChange]);

  // Shift-click range selection helper
  const lastSelectedRowIndex = useRef<number | null>(null);
  const handleRowCheckboxClick = (e: React.MouseEvent, rowIndex: number, rowId: string) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelectedRowIndex.current !== null) {
      const rows = table.getRowModel().rows;
      const start = Math.min(lastSelectedRowIndex.current, rowIndex);
      const end = Math.max(lastSelectedRowIndex.current, rowIndex);
      const newSelection = { ...rowSelection };
      for (let i = start; i <= end; i++) {
        newSelection[rows[i].id] = true;
      }
      setRowSelection(newSelection);
    } else {
      lastSelectedRowIndex.current = rowIndex;
      setRowSelection((prev) => ({
        ...prev,
        [rowId]: !prev[rowId],
      }));
    }
  };

  // Right-click context menu
  const handleContextMenu = (e: React.MouseEvent, row: TData) => {
    if (!getContextMenuItems) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      isOpen: true,
      row,
    });
  };

  // Export filtered data to CSV
  const handleExportCSV = () => {
    const rows = table.getFilteredRowModel().rows;
    if (rows.length === 0) return;

    const visibleCols = table.getVisibleLeafColumns().filter((c) => c.id !== 'select' && c.id !== 'actions');
    const headers = visibleCols.map((c) => (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id));

    const csvRows: string[] = [headers.join(',')];

    rows.forEach((r) => {
      const rowData = visibleCols.map((c) => {
        const val = r.getValue(c.id);
        const str = val === null || val === undefined ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      });
      csvRows.push(rowData.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableId}_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectedCount = Object.keys(rowSelection).filter((k) => rowSelection[k]).length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;

  return (
    <div className="flex flex-col h-full space-y-3" ref={tableContainerRef}>
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex flex-1 items-center gap-2">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-sky-500 transition-colors"
            />
            {globalFilter && (
              <button
                onClick={() => setGlobalFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Column Visibility Menu */}
          <div className="relative">
            <button
              onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              title="Pilih Kolom"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kolom</span>
            </button>

            {isColumnPickerOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsColumnPickerOpen(false)} />
                <div className="absolute left-0 mt-1.5 z-40 w-64 p-2.5 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-800 text-xs animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-zinc-200 pb-1.5 mb-1.5 border-b border-slate-100 dark:border-zinc-800">
                    <span>Atur & Urutan Kolom</span>
                    <button
                      type="button"
                      onClick={resetColumnOrder}
                      className="flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 hover:underline font-normal"
                      title="Kembalikan urutan default"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mb-2 leading-tight">
                    Centang untuk tampilkan. Tarik header tabel atau gunakan tombol panah untuk memindahkan posisi.
                  </p>
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {table.getVisibleLeafColumns().map((column, idx) => {
                      if (column.id === 'select' || column.id === 'actions') return null;
                      const headerName = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;
                      return (
                        <div
                          key={column.id}
                          className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-300"
                        >
                          <label className="flex items-center gap-2 cursor-pointer truncate flex-1 min-w-0 mr-2">
                            <input
                              type="checkbox"
                              checked={column.getIsVisible()}
                              onChange={column.getToggleVisibilityHandler()}
                              className="rounded-xs text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                            />
                            <span className="truncate">{headerName}</span>
                          </label>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveColumn(column.id, 'left')}
                              className="p-1 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-700"
                              title="Geser Kolom ke Kiri"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveColumn(column.id, 'right')}
                              className="p-1 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-700"
                              title="Geser Kolom ke Kanan"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700 rounded-lg transition-colors"
            title="Ekspor CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ekspor CSV</span>
          </button>
        </div>

        {/* Custom Actions (e.g. Tambah, Bulk Actions) */}
        {topToolbarActions && <div className="flex items-center gap-2">{topToolbarActions}</div>}
      </div>

      {/* Active Filter Chips */}
      {(columnFilters.length > 0 || debouncedGlobalFilter) && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400 dark:text-zinc-500 font-medium">Filter Aktif:</span>
          {debouncedGlobalFilter && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs">
              <span>Cari: "{debouncedGlobalFilter}"</span>
              <button onClick={() => setGlobalFilter('')} className="hover:text-sky-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {columnFilters.map((cf) => (
            <span
              key={cf.id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 text-xs"
            >
              <span>{cf.id}: {String(cf.value)}</span>
              <button
                onClick={() => setColumnFilters((prev) => prev.filter((f) => f.id !== cf.id))}
                className="hover:text-rose-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            onClick={() => {
              setGlobalFilter('');
              setColumnFilters([]);
            }}
            className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium ml-1"
          >
            Reset Semua Filter
          </button>
        </div>
      )}

      {/* Table Container (Winbox / RouterOS Styling) */}
      <div className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs flex flex-col relative">
        {/* Loading Progress Indicator */}
        {loading && (
          <div className="h-1 w-full bg-sky-100/40 dark:bg-zinc-800 overflow-hidden absolute top-0 left-0 right-0 z-30">
            <div className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 animate-progress-indeterminate" />
          </div>
        )}
        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[320px] max-h-[calc(100vh-270px)]">
          <table className="w-full text-left border-collapse text-xs">
            {/* Sticky Header */}
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 select-none border-b border-slate-200 dark:border-zinc-700 shadow-2xs">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isSorted = header.column.getIsSorted();
                    const isDraggable = header.column.id !== 'select' && header.column.id !== 'actions';
                    const isDropTarget = dragOverColId === header.column.id && draggedColId !== header.column.id;

                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        draggable={isDraggable}
                        onDragStart={(e) => {
                          if (!isDraggable) return;
                          e.dataTransfer.setData('text/plain', header.column.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggedColId(header.column.id);
                        }}
                        onDragOver={(e) => {
                          if (!isDraggable || !draggedColId || draggedColId === header.column.id) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const midpoint = rect.left + rect.width / 2;
                          const side = e.clientX < midpoint ? 'left' : 'right';
                          setDragOverColId(header.column.id);
                          setDropSide(side);
                        }}
                        onDragLeave={() => {
                          if (dragOverColId === header.column.id) {
                            setDragOverColId(null);
                            setDropSide(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleColumnDrop(header.column.id);
                        }}
                        onDragEnd={() => {
                          setDraggedColId(null);
                          setDragOverColId(null);
                          setDropSide(null);
                        }}
                        className={`py-2 px-2.5 font-semibold whitespace-nowrap text-xs border-r border-slate-200 dark:border-zinc-700 last:border-r-0 transition-all select-none relative ${
                          isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${
                          isDropTarget
                            ? dropSide === 'left'
                              ? 'border-l-3 border-l-sky-500 bg-sky-100/60 dark:bg-sky-950/70 text-sky-900 dark:text-sky-200'
                              : 'border-r-3 border-r-sky-500 bg-sky-100/60 dark:bg-sky-950/70 text-sky-900 dark:text-sky-200'
                            : draggedColId === header.column.id
                            ? 'opacity-40 bg-slate-200 dark:bg-zinc-700'
                            : ''
                        }`}
                        title={isDraggable ? 'Tahan & geser untuk mengubah urutan kolom' : undefined}
                      >
                        {header.isPlaceholder ? null : (
                          <div className="flex items-center gap-1.5">
                            {isDraggable && (
                              <span
                                className="text-slate-400 dark:text-zinc-500 hover:text-sky-500 cursor-grab shrink-0"
                                title="Geser posisi kolom"
                              >
                                <GripVertical className="w-3 h-3" />
                              </span>
                            )}
                            <div
                              onClick={header.column.getToggleSortingHandler()}
                              className={`flex items-center gap-1.5 flex-1 min-w-0 ${
                                header.column.getCanSort() ? 'cursor-pointer hover:text-sky-600 dark:hover:text-sky-400' : ''
                              }`}
                            >
                              <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                              {header.column.getCanSort() && (
                                <span className="shrink-0 text-slate-400 dark:text-zinc-500">
                                  {isSorted === 'asc' ? (
                                    <ArrowUp className="w-3.5 h-3.5 text-sky-500 font-bold" />
                                  ) : isSorted === 'desc' ? (
                                    <ArrowDown className="w-3.5 h-3.5 text-sky-500 font-bold" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-mono text-[11px] sm:text-xs">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-slate-500 dark:text-zinc-400 font-sans">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, index) => {
                  const isSelected = row.getIsSelected();
                  const isDisabled = isRowDisabled ? isRowDisabled(row.original) : false;
                  const isDynamic = isRowDynamic ? isRowDynamic(row.original) : false;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick && onRowClick(row.original)}
                      onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(row.original)}
                      onContextMenu={(e) => handleContextMenu(e, row.original)}
                      className={`transition-colors cursor-pointer select-none ${
                        isSelected
                          ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100 font-medium'
                          : isDisabled
                          ? 'bg-slate-50/70 dark:bg-zinc-900/40 text-slate-400 dark:text-zinc-500 italic'
                          : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-slate-800 dark:text-zinc-200'
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="py-1.5 px-3 border-r border-slate-100 dark:border-zinc-800/70 last:border-r-0 whitespace-nowrap tabular-nums"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Winbox-style Status Footer & Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 py-2 bg-slate-50 dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-400 select-none">
          {/* Winbox Stats string: "X dari Y item, Z terpilih" */}
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-700 dark:text-zinc-300">
              <strong className="text-slate-900 dark:text-white">{filteredCount}</strong> dari{' '}
              <strong className="text-slate-900 dark:text-white">{totalCount}</strong> item
              {selectedCount > 0 && (
                <span className="text-sky-600 dark:text-sky-400 ml-1">
                  (<strong>{selectedCount}</strong> terpilih)
                </span>
              )}
            </span>

            {/* Select All shortcut prompt */}
            <span className="hidden md:inline text-[11px] text-slate-400 dark:text-zinc-500">
              · Ctrl+A untuk pilih semua
            </span>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-3">
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5">
              <span>Baris:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="py-1 px-2 text-xs bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-md text-slate-800 dark:text-zinc-200 focus:outline-hidden"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={1000}>Semua</option>
              </select>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Halaman Pertama"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2 text-xs tabular-nums text-slate-700 dark:text-zinc-300">
                {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
              </span>

              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Halaman Terakhir"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right-click Context Menu */}
      {getContextMenuItems && contextMenu.row && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isOpen={contextMenu.isOpen}
          onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false, row: null }))}
          items={getContextMenuItems(contextMenu.row)}
        />
      )}
    </div>
  );
}
