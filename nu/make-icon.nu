#!/usr/bin/env nu

# Usage: ./generate-icons.nu <input_image>

# Check if an input image was provided
if ($args | length) == 0 {
    echo "Usage: generate-icons.nu <input_image>"
    exit 1
end

let input = $args.0
# Extract basename without the extension:
let basename = ($input | path basename | str trim -c ".${(echo $input | path extension)}")

# Check if ImageMagick is installed
if (which magick | empty?) {
    echo "Error: ImageMagick (magick) is not installed."
    exit 1
end

# Generate .ico file with multiple resolutions
echo $"Generating ($basename).ico..."
magick $input -define icon:auto-resize=256,128,64,48,32,16 ($basename + ".ico")

# Create an iconset folder for .icns
let iconset_dir = ($basename + ".iconset")
mkdir $iconset_dir

echo "Generating PNGs for .icns..."

# Create an array of records for each needed icon size and file name
let icons = [
    { file: "icon_16x16.png",      size: 16  }
    { file: "icon_16x16@2x.png",   size: 32  }
    { file: "icon_32x32.png",      size: 32  }
    { file: "icon_32x32@2x.png",   size: 64  }
    { file: "icon_128x128.png",    size: 128 }
    { file: "icon_128x128@2x.png", size: 256 }
    { file: "icon_256x256.png",    size: 256 }
    { file: "icon_256x256@2x.png", size: 512 }
    { file: "icon_512x512.png",    size: 512 }
    { file: "icon_512x512@2x.png", size: 1024 }
]

# Loop over the icons array and generate resized PNGs
for icon in $icons {
    let size_str = ($icon.size | str to-string) + "x" + ($icon.size | str to-string)
    let output = $iconset_dir + "/" + $icon.file
    echo $"Generating $output at size $size_str..."
    magick $input -resize $size_str $output
}

# Check if iconutil is available (macOS only)
if !(which iconutil | empty?) {
    echo $"Creating ($basename).icns..."
    iconutil -c icns $iconset_dir -o ($basename + ".icns")
    echo "Done!"
} else {
    echo "Warning: 'iconutil' not found. Skipping .icns generation."
    echo "You can use the $iconset_dir folder manually on macOS."
end
