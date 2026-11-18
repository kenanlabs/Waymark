import { useId, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface GroupManagerModalProps {
  open: boolean;
  groups: Array<{ name: string; count: number }>;
  onClose: () => void;
  onAddGroup: (name: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onDeleteGroup: (name: string) => void;
}

export function GroupManagerModal({
  open,
  groups,
  onClose,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
}: GroupManagerModalProps) {
  const uid = useId();
  const [newName, setNewName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddGroup(trimmed);
    setNewName('');
  };

  const commitRename = (oldName: string) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== oldName) {
      onRenameGroup(oldName, trimmed);
    }
    setEditingGroup(null);
    setEditValue('');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
        >
          <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-title`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md bg-white dark:bg-[#111113] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col max-h-[82vh]"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E4E7] dark:border-[#27272A]">
              <div>
                <h2
                  id={`${uid}-title`}
                  className="font-display text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA]"
                >
                  管理环境分组
                </h2>
                <p className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                  重命名将同步更新该组内所有站点；删除分组后站点保留并移入「默认分组」
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭分组管理"
                className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white rounded-lg hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto overscroll-contain">
              <form onSubmit={handleAdd} className="flex gap-2">
                <label htmlFor={`${uid}-new`} className="sr-only">
                  新分组名称
                </label>
                <input
                  id={`${uid}-new`}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入新分组名称（例如：客户生产环境）"
                  className="flex-1 h-9 px-3 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white"
                />
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="inline-flex items-center gap-1 h-9 px-3.5 text-xs font-medium text-white bg-[#09090B] hover:bg-[#27272A] dark:bg-[#FAFAFA] dark:text-[#09090B] rounded-lg disabled:opacity-40 transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>新建</span>
                </button>
              </form>

              <div className="divide-y divide-[#F4F4F5] dark:divide-[#1F1F23] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl overflow-hidden">
                {groups.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#71717A]">暂无分组</div>
                ) : (
                  groups.map((grp) => {
                    const isEditing = editingGroup === grp.name;
                    const isDefault = grp.name === '默认分组';

                    return (
                      <div
                        key={grp.name}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white dark:bg-[#111113]"
                      >
                        {isEditing ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename(grp.name);
                            }}
                            className="flex-1 flex items-center gap-2"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingGroup(null);
                                  setEditValue('');
                                }
                              }}
                              className="flex-1 h-7 px-2.5 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#09090B]/40 dark:border-white/40 rounded-md focus:outline-none"
                            />
                            <button
                              type="submit"
                              aria-label="确认重命名"
                              className="p-1 text-[#16A34A] hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="取消重命名"
                              onClick={() => {
                                setEditingGroup(null);
                                setEditValue('');
                              }}
                              className="p-1 text-[#71717A] hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="text-xs font-medium text-[#09090B] dark:text-[#FAFAFA] truncate">
                                {grp.name}
                              </span>
                              <span className="font-mono text-[11px] tabular-nums text-[#A1A1AA]">
                                {grp.count} 项
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGroup(grp.name);
                                  setEditValue(grp.name);
                                }}
                                aria-label={`重命名分组 ${grp.name}`}
                                title="重命名"
                                className="p-1.5 text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1F1F23] rounded-md transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteGroup(grp.name)}
                                  aria-label={`删除分组 ${grp.name}`}
                                  title="删除分组"
                                  className="p-1.5 text-[#71717A] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#2B1414] rounded-md transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
