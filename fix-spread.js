const fs = require('fs');

// Read the entire file
const content = fs.readFileSync('src/screens/AdminScreen.tsx', 'utf8');

// Step 1: Find and extract base styles
const baseStylesMatch = content.match(/const styles = StyleSheet\.create\({([\s\S]*?)\}\);/);
if (!baseStylesMatch) {
  console.error('Could not find base styles');
  process.exit(1);
}

const baseStylesContent = baseStylesMatch[1];

// Step 2: Parse base styles into a map
const baseStyles = {};
const styleRegex = /(\w+):\s*\{([^}]*)\}/g;
let match;

while ((match = styleRegex.exec(baseStylesContent)) !== null) {
  const styleName = match[1];
  const styleProps = match[2].trim();
  baseStyles[styleName] = styleProps;
}

console.log(`Extracted ${Object.keys(baseStyles).length} base styles`);

// Step 3: Replace all spread operators with actual properties
let newContent = content;

// Find all spread patterns like "...styles.xyz,"
const spreadRegex = /\.\.\. styles\.(\w+),/g;
const spreads = [];

while ((match = spreadRegex.exec(content)) !== null) {
  spreads.push({ full: match[0], styleName: match[1], index: match.index });
}

console.log(`Found ${spreads.length} spread operators`);

// Replace spreads from end to beginning to preserve indices
for (let i = spreads.length - 1; i >= 0; i--) {
  const spread = spreads[i];
  const baseProps = baseStyles[spread.styleName];
  
  if (baseProps) {
    // Remove color properties from base props
    const propsLines = baseProps.split(',').map(p => p.trim()).filter(p => {
      return p && !p.startsWith('backgroundColor:') && !p.startsWith('color:') && 
             !p.startsWith('borderColor:') && !p.startsWith('shadowColor:') &&
             !p.startsWith('borderBottomColor:') && !p.startsWith('borderTopColor:');
    });
    
    if (propsLines.length > 0) {
      const replacement = propsLines.join(',\n    ') + ',';
      newContent = newContent.slice(0, spread.index) + replacement + newContent.slice(spread.index + spread.full.length);
    } else {
      // No layout props, just remove the spread
      newContent = newContent.slice(0, spread.index) + newContent.slice(spread.index + spread.full.length);
    }
  } else {
    console.warn(`Warning: No base style found for ${spread.styleName}`);
    // Just remove the spread
    newContent = newContent.slice(0, spread.index) + newContent.slice(spread.index + spread.full.length);
  }
}

// Step 4: Delete the base styles section
newContent = newContent.replace(/const styles = StyleSheet\.create\({[\s\S]*?\}\);/, '');

// Step 5: Replace themedStyles useMemo to use a function
const themedStylesPattern = /const themedStyles = useMemo\(\(\) => \(\{([\s\S]*?)\}\), \[colors\]\);/;
const themedMatch = newContent.match(themedStylesPattern);

if (themedMatch) {
  const themedStylesContent = themedMatch[1];
  
  // Create the createThemedStyles function
  const createFunction = `const createThemedStyles = (colors: any) => ({${themedStylesContent}});`;
  
  // Find where to insert it (before the component)
  const componentStart = newContent.indexOf('export default function AdminScreen');
  
  // Insert function before component and replace useMemo
  newContent = newContent.slice(0, componentStart) + 
               createFunction + '\n\n' + 
               newContent.slice(componentStart);
  
  // Replace themedStyles useMemo
  newContent = newContent.replace(
    themedStylesPattern,
    'const themedStyles = useMemo(() => createThemedStyles(colors), [colors]);'
  );
}

// Write the result
fs.writeFileSync('src/screens/AdminScreen.tsx', newContent);

console.log('✅ Successfully fixed AdminScreen.tsx');
console.log('   - Removed all spread operators');
console.log('   - Created createThemedStyles function');
console.log('   - Deleted base styles');
