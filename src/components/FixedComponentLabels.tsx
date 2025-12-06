import React from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface MechanicalComponent {
  name: string;
  type: string;
  material: string;
  massProperties: {
    volume: number;
    mass: number;
    centerOfMass: THREE.Vector3;
    boundingBox: {
      min: THREE.Vector3;
      max: THREE.Vector3;
      dimensions: { width: number; length: number; height: number };
    };
    surfaceArea: number;
  };
}

interface MechanicalAnalysis {
  components: MechanicalComponent[];
}

// Fixed 3D Component Labels that properly position with scaled models
export const FixedComponentLabels: React.FC<{
  mechanicalAnalysis: MechanicalAnalysis;
  showLabels: boolean;
}> = ({ mechanicalAnalysis, showLabels }) => {
  if (!showLabels || !mechanicalAnalysis.components.length) {
    return null;
  }

  return (
    <group>
      {mechanicalAnalysis.components.map((component, index) => {
        // Component position is already in the scaled coordinate system
        const position = component.massProperties.centerOfMass;
        const { width, length, height } = component.massProperties.boundingBox.dimensions;
        
        // Calculate appropriate label font size based on overall model scale
        // Since the model is auto-scaled to ~10 units, we use a fixed base size
        const baseFontSize = 0.3;
        const labelFontSize = baseFontSize;
        const subFontSize = labelFontSize * 0.6;
        
        // Calculate label offset - position label above the component
        // Use a fixed offset since model is scaled to standard size
        const labelOffset = 1.5;
        
        // Position label above the component center
        const labelPosition: [number, number, number] = [
          position.x,
          position.y + labelOffset,
          position.z
        ];
        
        // Fixed indicator size
        const indicatorSize = 0.1;
        
        return (
          <group key={`${component.name}-${index}`}>
            {/* Component label text */}
            <Text
              position={labelPosition}
              fontSize={labelFontSize}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={labelFontSize * 0.08}
              outlineColor="#000000"
            >
              {component.name}
            </Text>
            
            {/* Component info subtitle */}
            <Text
              position={[labelPosition[0], labelPosition[1] - (labelFontSize * 1.5), labelPosition[2]]}
              fontSize={subFontSize}
              color="#cccccc"
              anchorX="center"
              anchorY="middle"
              outlineWidth={subFontSize * 0.06}
              outlineColor="#000000"
            >
              {component.material} • {component.type}
            </Text>
            
            {/* Volume info */}
            <Text
              position={[labelPosition[0], labelPosition[1] - (labelFontSize * 2.5), labelPosition[2]]}
              fontSize={subFontSize * 0.8}
              color="#888888"
              anchorX="center"
              anchorY="middle"
              outlineWidth={subFontSize * 0.04}
              outlineColor="#000000"
            >
              {`Vol: ${component.massProperties.volume.toFixed(1)} cm³`}
            </Text>
            
            {/* Indicator dot at component center */}
            <mesh position={[position.x, position.y, position.z]}>
              <sphereGeometry args={[indicatorSize, 8, 8]} />
              <meshBasicMaterial color="#4a90e2" />
            </mesh>
            
            {/* Connection line from dot to label */}
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  array={new Float32Array([
                    position.x, position.y, position.z,
                    labelPosition[0], labelPosition[1] - (labelFontSize * 0.8), labelPosition[2]
                  ])}
                  count={2}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#ffffff" opacity={0.6} transparent />
            </line>
          </group>
        );
      })}
    </group>
  );
};