import React from 'react';
import { Tag, Eye, EyeOff, Settings, Layers } from 'lucide-react';

interface Component {
  id: string;
  name: string;
  type: string;
  material?: string;
  visible: boolean;
  mass?: number;
  volume?: number;
}

interface ComponentListPanelProps {
  components: Component[];
  selectedComponent?: string;
  onComponentSelect: (id: string) => void;
  onComponentVisibilityToggle: (id: string) => void;
  onComponentRename?: (id: string, newName: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const ComponentListPanel: React.FC<ComponentListPanelProps> = ({
  components,
  selectedComponent,
  onComponentSelect,
  onComponentVisibilityToggle,
  onComponentRename,
  isExpanded = true,
  onToggleExpand
}) => {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');

  const handleStartEdit = (component: Component) => {
    setEditingId(component.id);
    setEditName(component.name);
  };

  const handleSaveEdit = () => {
    if (editingId && onComponentRename) {
      onComponentRename(editingId, editName);
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-800">Components</h3>
          <span className="text-xs text-gray-500">({components.length})</span>
        </div>
        <button className="text-gray-400 hover:text-gray-600">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Component List */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {components.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No components detected
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {components.map((component) => (
                <li
                  key={component.id}
                  className={`
                    px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors
                    ${selectedComponent === component.id ? 'bg-indigo-50' : ''}
                  `}
                  onClick={() => onComponentSelect(component.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <Tag className="w-4 h-4 text-gray-400" />
                      {editingId === component.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 px-2 py-1 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                      ) : (
                        <div 
                          className="flex-1"
                          onDoubleClick={() => handleStartEdit(component)}
                        >
                          <div className="text-sm font-medium text-gray-800">
                            {component.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {component.type}
                            {component.material && ` • ${component.material}`}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onComponentVisibilityToggle(component.id);
                      }}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                      {component.visible ? (
                        <Eye className="w-4 h-4 text-gray-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {/* Component details */}
                  {selectedComponent === component.id && (component.mass || component.volume) && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
                      {component.volume && (
                        <div>Volume: {component.volume.toFixed(2)} cm³</div>
                      )}
                      {component.mass && (
                        <div>Mass: {component.mass.toFixed(2)} g</div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};