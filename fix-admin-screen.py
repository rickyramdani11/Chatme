#!/usr/bin/env python3
import re

# Read the file
with open('src/screens/AdminScreen.tsx', 'r') as f:
    content = f.read()

# Split into lines for processing
lines = content.split('\n')

# Find the key sections
component_start = next(i for i, line in enumerate(lines) if 'export default function AdminScreen' in line)
themed_start = next(i for i, line in enumerate(lines) if 'const themedStyles = useMemo' in line)
themed_end = next(i for i, line in enumerate(lines) if i > themed_start and line.strip() == '}), [colors]);')
base_start = next(i for i, line in enumerate(lines) if 'const styles = StyleSheet.create({' in line)

print(f"Component starts at line: {component_start + 1}")
print(f"Themed styles: lines {themed_start + 1} to {themed_end + 1}")  
print(f"Base styles start at line: {base_start + 1}")

# Extract base styles section (everything between StyleSheet.create({ and });)
base_section = '\n'.join(lines[base_start+1:-1])  # Skip the create line and closing });

# Extract themed styles section (everything between useMemo(() => ({ and }), [colors]);)
themed_section = '\n'.join(lines[themed_start+1:themed_end])

# Parse both sections to extract style objects
def parse_styles(section_text):
    """Parse style objects from a section, handling nested braces correctly"""
    styles = {}
    current_style = None
    current_props = []
    brace_count = 0
    
    for line in section_text.split('\n'):
        stripped = line.strip()
        
        # Count braces to track nesting
        brace_count += stripped.count('{') - stripped.count('}')
        
        # Check if this is a style name declaration (e.g., "container: {")
        if re.match(r'^\w+:\s*\{', stripped) and brace_count == 1:
            # Save previous style if exists
            if current_style:
                styles[current_style] = current_props
            # Start new style
            current_style = re.match(r'^(\w+):', stripped).group(1)
            current_props = []
        elif current_style and brace_count == 1 and stripped.endswith(','):
            # This is a property line, add it
            current_props.append(line)
        elif current_style and brace_count == 0 and (stripped == '},' or stripped == '}'):
            # End of current style
            styles[current_style] = current_props
            current_style = None
            current_props = []
    
    return styles

base_styles = parse_styles(base_section)
themed_styles = parse_styles(themed_section)

print(f"\nParsed {len(base_styles)} base styles")
print(f"Parsed {len(themed_styles)} themed styles")

# Merge styles: for each style name, combine base (layout) + themed (colors)
all_style_names = set(list(base_styles.keys()) + list(themed_styles.keys()))
merged_styles = {}

for style_name in sorted(all_style_names):
    merged_props = []
    
    # Add base style properties (if exists)
    if style_name in base_styles:
        for prop_line in base_styles[style_name]:
            # Skip color-related properties from base styles
            prop_text = prop_line.strip()
            if not any(prop_text.startswith(color_prop) for color_prop in 
                      ['backgroundColor:', 'color:', 'borderColor:', 'shadowColor:', 
                       'borderBottomColor:', 'borderTopColor:', 'borderLeftColor:', 'borderRightColor:']):
                merged_props.append(prop_line)
    
    # Add themed style properties (if exists), skipping spread operators
    if style_name in themed_styles:
        for prop_line in themed_styles[style_name]:
            # Skip lines with spread operators
            if '...styles.' not in prop_line:
                merged_props.append(prop_line)
    
    if merged_props:
        merged_styles[style_name] = merged_props

# Build the createThemedStyles function
create_function_lines = ['const createThemedStyles = (colors: any) => ({']

for style_name in sorted(merged_styles.keys()):
    props = merged_styles[style_name]
    create_function_lines.append(f'  {style_name}: {{')
    create_function_lines.extend(props)
    create_function_lines.append('  },')

create_function_lines.append('});')
create_function = '\n'.join(create_function_lines)

# Build the new file
new_lines = (
    lines[:component_start] +  # Everything before component
    ['', create_function, ''] +  # Add createThemedStyles function
    lines[component_start:themed_start] +  # Component start to themed styles
    ['  const themedStyles = useMemo(() => createThemedStyles(colors), [colors]);', ''] +  # New themed styles line
    lines[themed_end+1:base_start]  # After themed styles to before base styles (skip base styles entirely)
)

# Write the result
with open('src/screens/AdminScreen.tsx', 'w') as f:
    f.write('\n'.join(new_lines))

print(f"\n✅ Successfully transformed AdminScreen.tsx")
print(f"   - Created createThemedStyles function with {len(merged_styles)} styles")
print(f"   - Removed all spread operators")
print(f"   - Deleted base styles section")
