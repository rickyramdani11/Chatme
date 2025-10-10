const fs = require('fs');

console.log('Starting AdminScreen.tsx transformation...\n');

// Read file
let content = fs.readFileSync('src/screens/AdminScreen.tsx', 'utf8');

// Step 1: Skip for now - we'll do this after merging styles
console.log('Step 1: Skipping JSX replacement for now...\n');

// Step 2: Extract base styles
console.log('Step 2: Extracting base styles...');
const baseStylesMatch = content.match(/const styles = StyleSheet\.create\({([\s\S]*?)\}\);/);
if (!baseStylesMatch) {
  console.error('ERROR: Could not find base styles!');
  process.exit(1);
}

const baseStylesContent = baseStylesMatch[1];
const baseStyles = {};

// Parse base styles - simple regex approach
const lines = baseStylesContent.split('\n');
let currentStyle = null;
let currentProps = [];
let braceDepth = 0;

for (const line of lines) {
  const trimmed = line.trim();
  
  // Count braces
  for (const char of trimmed) {
    if (char === '{') braceDepth++;
    if (char === '}') braceDepth--;
  }
  
  // Style name line (e.g., "container: {")
  if (braceDepth === 1 && trimmed.match(/^\w+:\s*\{/)) {
    if (currentStyle) {
      baseStyles[currentStyle] = currentProps.join('\n');
    }
    currentStyle = trimmed.match(/^(\w+):/)[1];
    currentProps = [];
  }
  // Property line
  else if (currentStyle && braceDepth === 1 && trimmed && !trimmed.startsWith('//')) {
    const prop = trimmed.trim();
    // Exclude color properties
    if (!prop.startsWith('backgroundColor:') && !prop.startsWith('color:') && 
        !prop.startsWith('borderColor:') && !prop.startsWith('shadowColor:') &&
        !prop.startsWith('borderBottomColor:') && !prop.startsWith('borderTopColor:') &&
        !prop.startsWith('borderLeftColor:') && !prop.startsWith('borderRightColor:')) {
      currentProps.push('    ' + prop);
    }
  }
  // End of style
  else if (currentStyle && braceDepth === 0) {
    baseStyles[currentStyle] = currentProps.join('\n');
    currentStyle = null;
    currentProps = [];
  }
}

console.log(`   ✓ Extracted ${Object.keys(baseStyles).length} base styles\n`);

// Step 3: Replace spread operators with actual properties
console.log('Step 3: Removing spread operators...');
const spreadRegex = /\.\.\. styles\.(\w+),/g;
const spreads = [];
let match;

while ((match = spreadRegex.exec(content)) !== null) {
  spreads.push({
    full: match[0],
    styleName: match[1],
    index: match.index
  });
}

console.log(`   Found ${spreads.length} spread operators`);

// Replace from end to beginning
for (let i = spreads.length - 1; i >= 0; i--) {
  const spread = spreads[i];
  const baseProps = baseStyles[spread.styleName];
  
  if (baseProps && baseProps.trim()) {
    content = content.slice(0, spread.index) + baseProps + ',' + content.slice(spread.index + spread.full.length);
  } else {
    // Just remove the spread
    content = content.slice(0, spread.index) + content.slice(spread.index + spread.full.length);
  }
}
console.log(`   ✓ Removed all spread operators\n`);

// Step 4: Create createThemedStyles function
console.log('Step 4: Creating createThemedStyles function...');
const themedStylesPattern = /const themedStyles = useMemo\(\(\) => \(\{([\s\S]*?)\}\), \[colors\]\);/;
const themedMatch = content.match(themedStylesPattern);

if (!themedMatch) {
  console.error('ERROR: Could not find themedStyles!');
  process.exit(1);
}

const themedStylesContent = themedMatch[1];
const createFunction = `const createThemedStyles = (colors: any) => ({${themedStylesContent}});`;

// Find component start
const componentIndex = content.indexOf('export default function AdminScreen');
if (componentIndex === -1) {
  console.error('ERROR: Could not find component!');
  process.exit(1);
}

// Insert createThemedStyles before component
content = content.slice(0, componentIndex) + createFunction + '\n\n' + content.slice(componentIndex);

// Replace themedStyles useMemo
content = content.replace(
  themedStylesPattern,
  '  const themedStyles = useMemo(() => createThemedStyles(colors), [colors]);'
);
console.log('   ✓ Created createThemedStyles function\n');

// Step 5: Delete base styles
console.log('Step 5: Deleting base styles...');
content = content.replace(/const styles = StyleSheet\.create\({[\s\S]*?\}\);/, '');
console.log('   ✓ Deleted base styles\n');

// Step 6: Now replace all JSX style={styles.X} to style={themedStyles.X}
console.log('Step 6: Replacing JSX style references...');
const styleRefRegex = /style=\{styles\.(\w+)\}/g;
let jsxMatchCount = 0;
content = content.replace(styleRefRegex, (match, styleName) => {
  jsxMatchCount++;
  return `style={themedStyles.${styleName}}`;
});
console.log(`   ✓ Replaced ${jsxMatchCount} style={styles.X} references\n`);

// Write result
fs.writeFileSync('src/screens/AdminScreen.tsx', content);

console.log('✅ SUCCESS! AdminScreen.tsx has been completely transformed');
console.log('   - All style={styles.X} changed to style={themedStyles.X}');
console.log('   - All spread operators removed');
console.log('   - createThemedStyles function created');
console.log('   - Base styles deleted');
