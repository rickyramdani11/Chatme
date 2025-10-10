const fs = require('fs');

// Read the file
const content = fs.readFileSync('src/screens/AdminScreen.tsx', 'utf8');
const lines = content.split('\n');

// Find key line numbers
const componentStart = lines.findIndex(l => l.includes('export default function AdminScreen'));
const themedStylesStart = lines.findIndex(l => l.includes('const themedStyles = useMemo'));
const themedStylesEnd = lines.findIndex((l, i) => i > themedStylesStart && l.trim() === '}), [colors]);');
const baseStylesStart = lines.findIndex(l => l.includes('const styles = StyleSheet.create({'));
const baseStylesEnd = lines.length - 1; // Last line

console.log('Component starts at line:', componentStart + 1);
console.log('themedStyles starts at line:', themedStylesStart + 1);
console.log('themedStyles ends at line:', themedStylesEnd + 1);
console.log('Base styles start at line:', baseStylesStart + 1);
console.log('Base styles end at line:', baseStylesEnd + 1);

// Extract base styles (layout properties)
const baseStylesLines = lines.slice(baseStylesStart + 1, baseStylesEnd);
const baseStyles = {};
let currentStyle = null;
let currentProps = [];

for (const line of baseStylesLines) {
  const trimmed = line.trim();
  
  if (trimmed.match(/^(\w+):\s*{/)) {
    // Save previous style
    if (currentStyle) {
      baseStyles[currentStyle] = currentProps.join('\n    ');
    }
    // Start new style
    currentStyle = trimmed.match(/^(\w+):/)[1];
    currentProps = [];
  } else if (trimmed === '},') {
    // End of style
    if (currentStyle) {
      baseStyles[currentStyle] = currentProps.join('\n    ');
      currentStyle = null;
      currentProps = [];
    }
  } else if (currentStyle && trimmed && !trimmed.startsWith('//') && trimmed !== '});') {
    // Add property to current style (skip color properties and comments)
    if (!trimmed.startsWith('backgroundColor:') && 
        !trimmed.startsWith('color:') && 
        !trimmed.startsWith('borderColor:') &&
        !trimmed.startsWith('shadowColor:')) {
      currentProps.push('    ' + trimmed);
    }
  }
}

// Extract themed styles (color properties)
const themedStylesLines = lines.slice(themedStylesStart + 1, themedStylesEnd);
const themedStyles = {};
currentStyle = null;
currentProps = [];

for (const line of themedStylesLines) {
  const trimmed = line.trim();
  
  if (trimmed.match(/^(\w+):\s*{/)) {
    // Save previous style
    if (currentStyle) {
      themedStyles[currentStyle] = currentProps.join('\n    ');
    }
    // Start new style
    currentStyle = trimmed.match(/^(\w+):/)[1];
    currentProps = [];
  } else if (trimmed === '},') {
    // End of style
    if (currentStyle) {
      themedStyles[currentStyle] = currentProps.join('\n    ');
      currentStyle = null;
      currentProps = [];
    }
  } else if (currentStyle && trimmed && trimmed.startsWith('...styles.')) {
    // Skip spread operator lines
    continue;
  } else if (currentStyle && trimmed && !trimmed.startsWith('//')) {
    // Add property to current style (color properties only)
    if (trimmed.startsWith('backgroundColor:') || 
        trimmed.startsWith('color:') || 
        trimmed.startsWith('borderColor:') ||
        trimmed.startsWith('shadowColor:') ||
        trimmed.startsWith('borderBottomColor:') ||
        trimmed.startsWith('borderTopColor:')) {
      currentProps.push('    ' + trimmed);
    }
  }
}

// Merge styles: for each style name, combine base layout + themed colors
const allStyleNames = new Set([...Object.keys(baseStyles), ...Object.keys(themedStyles)]);
const mergedStyles = [];

for (const styleName of Array.from(allStyleNames).sort()) {
  const base = baseStyles[styleName] || '';
  const themed = themedStyles[styleName] || '';
  
  const props = [];
  if (base) props.push(base);
  if (themed) props.push(themed);
  
  if (props.length > 0) {
    mergedStyles.push(`  ${styleName}: {\n${props.join(',\n')}\n  }`);
  }
}

// Build the createThemedStyles function
const createThemedStylesFunction = `
const createThemedStyles = (colors: any) => ({
${mergedStyles.join(',\n')}
});
`;

// Build new file content
const newLines = [
  ...lines.slice(0, componentStart),  // Everything before component
  createThemedStylesFunction,  // Add createThemedStyles function
  '',  // Empty line
  ...lines.slice(componentStart, themedStylesStart),  // Component start to themedStyles
  '  const themedStyles = useMemo(() => createThemedStyles(colors), [colors]);',  // New themedStyles line
  ...lines.slice(themedStylesEnd + 1, baseStylesStart),  // After themedStyles to before base styles
  // Skip base styles entirely
];

// Write the fixed file
fs.writeFileSync('src/screens/AdminScreen.tsx', newLines.join('\n'));
console.log('✅ Fixed AdminScreen.tsx - removed spreads and merged styles');
