import React, { useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Tag } from 'lucide-react';

interface ComponentLabel {
  id: string;
  name: string;
  position: THREE.Vector3;
  visible?: boolean;
}

interface ComponentLabelsProps {
  components: ComponentLabel[];
  showLabels: boolean;
  selectedComponent?: string;
  onComponentClick?: (id: string) => void;
}

export const ComponentLabels: React.FC<ComponentLabelsProps> = ({
  components,
  showLabels,
  selectedComponent,
  onComponentClick
}) => {
  if (!showLabels || !components || components.length === 0) {
    return null;
  }

  return (
    <>
      {components.map((component) => (
        <Html
          key={component.id}
          position={component.position}
          center
          distanceFactor={10}
          occlude={true}
          style={{
            transition: 'all 0.2s',
            opacity: component.visible !== false ? 1 : 0.5,
            pointerEvents: 'auto',
            userSelect: 'none'
          }}
        >
          <div
            className={`
              flex items-center gap-1 px-2 py-1 rounded-lg shadow-lg
              ${selectedComponent === component.id 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white/90 text-gray-800 hover:bg-indigo-50'
              }
              border border-gray-200 cursor-pointer
              transition-all duration-200 transform hover:scale-105
            `}
            onClick={() => onComponentClick?.(component.id)}
          >
            <Tag size={12} />
            <span className="text-xs font-medium whitespace-nowrap">
              {component.name}
            </span>
          </div>
        </Html>
      ))}
    </>
  );
};

// Component for rendering bounding box outlines
export const ComponentBoundingBoxes: React.FC<{
  components: Array<{
    id: string;
    bounds: THREE.Box3;
    selected?: boolean;
    color?: string;
  }>;
}> = ({ components }) => {
  return (
    <>
      {components.map((component) => {
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        component.bounds.getSize(size);
        component.bounds.getCenter(center);

        return (
          <group key={component.id} position={center}>
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
              <lineBasicMaterial 
                color={component.color || (component.selected ? '#4f46e5' : '#6b7280')}
                linewidth={component.selected ? 2 : 1}
                opacity={component.selected ? 1 : 0.5}
                transparent
              />
            </lineSegments>
          </group>
        );
      })}
    </>
  );
};