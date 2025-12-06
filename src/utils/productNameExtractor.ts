/**
 * Utility functions for extracting and cleaning product names from user prompts
 */

/**
 * Extract the actual product name from a user prompt by removing common prefixes
 * "Design a car wheel assembly" → "Car wheel assembly"
 * "Create an engine block" → "Engine block"
 */
export function extractProductName(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') {
    return 'CAD Model';
  }
  
  let cleaned = prompt.trim();
  
  // Remove common prompt prefixes (case insensitive)
  const prefixesToRemove = [
    /^design\s+a?\s*/i,
    /^create\s+a?\s*/i,
    /^make\s+a?\s*/i,
    /^build\s+a?\s*/i,
    /^generate\s+a?\s*/i,
    /^model\s+a?\s*/i,
    /^i\s+want\s+(to\s+)?(design|create|make|build)\s+a?\s*/i,
    /^i\s+need\s+a?\s*/i,
    /^please\s+(create|design|make|build)\s+a?\s*/i,
    /^can\s+you\s+(create|design|make|build)\s+a?\s*/i,
    /^let'?s\s+(create|design|make|build)\s+a?\s*/i,
    /^3d\s+model\s+generated\s+from:\s*/i,
  ];
  
  for (const prefix of prefixesToRemove) {
    cleaned = cleaned.replace(prefix, '');
  }
  
  // Remove leading/trailing articles if they remain
  cleaned = cleaned.replace(/^(a|an|the)\s+/i, '');
  
  // Remove trailing descriptions after "that", "with", "for", etc.
  cleaned = cleaned.replace(/\s+(that|which|with|for|having|featuring).*$/i, '');
  
  // Clean up whitespace and capitalize
  cleaned = cleaned.trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  // Fallback if nothing meaningful remains
  if (!cleaned || cleaned.length < 2) {
    return 'CAD Model';
  }
  
  return cleaned;
}

/**
 * Get the best product name from a CAD model object
 */
export function getModelProductName(model: any): string {
  // Priority order for product name sources - prioritize original user input
  const sources = [
    // First, try the original user prompts
    model?.cadModel?.originalPrompt,
    model?.cadModel?.prompt,
    // Then try model names
    model?.name,
    // Only fall back to product specs if they don't contain generic AI terms
    model?.productSpecs?.title && !isGenericAITerm(model.productSpecs.title) ? model.productSpecs.title : null,
    model?.productSpecs?.name && !isGenericAITerm(model.productSpecs.name) ? model.productSpecs.name : null,
    // Finally, description as last resort
    model?.description
  ];
  
  for (const source of sources) {
    if (source && typeof source === 'string') {
      const cleaned = extractProductName(source);
      if (cleaned !== 'CAD Model' && !isGenericAITerm(cleaned)) {
        return cleaned;
      }
    }
  }
  
  return 'CAD Model';
}

/**
 * Check if a term is a generic AI-generated term that should be avoided
 */
function isGenericAITerm(term: string): boolean {
  if (!term) return false;
  
  const genericTerms = [
    'complex pla assembly',
    'main body',
    'primary component',
    'structural element',
    'mechanical assembly',
    'custom component',
    'generated model',
    'cad model',
    'prototype design'
  ];
  
  const lowerTerm = term.toLowerCase().trim();
  return genericTerms.some(generic => lowerTerm.includes(generic));
}

/**
 * Create a title case version of the product name for display
 */
export function formatProductNameForDisplay(productName: string): string {
  if (!productName) return 'CAD Model';
  
  return productName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Create a version suitable for technical contexts (manufacturing, patents)
 */
export function formatProductNameForTechnical(productName: string): string {
  if (!productName) return 'mechanical-component';
  
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .trim();
} 