#!/usr/bin/env fish

# Bundle comparison script using esbuild for bundling and minification
# Compares minified bundle sizes between local signals and Preact signals

echo "📦 Bundling and minifying local signals with esbuild..."
deno run -A npm:esbuild@^0.19.0 ./mod.ts --bundle --minify --format=esm --outfile=/tmp/bundle_local.min.js 2>/dev/null

echo "📦 Installing @preact/signals-core from npm..."
cd /tmp && npm install @preact/signals-core@1.12.1 --silent 2>/dev/null

echo "📦 Creating temporary entry file for official Preact signals..."
printf "export * from '@preact/signals-core';\n" > /tmp/preact_entry.js

echo "📦 Bundling and minifying official @preact/signals-core with esbuild..."
cd /tmp && deno run -A npm:esbuild@^0.19.0 ./preact_entry.js --bundle --minify --format=esm --outfile=./bundle_preact.min.js 2>/dev/null

echo ""
echo "📊 Bundle Size Comparison:"
echo "=========================="

set local_size (wc -c < /tmp/bundle_local.min.js | string trim)
set preact_size (wc -c < /tmp/bundle_preact.min.js | string trim)

echo "Minified:"
echo "  Local Signals:  $local_size bytes"
echo "  Preact Signals: $preact_size bytes"

if test $preact_size -gt 0
    set ratio (math "$local_size / $preact_size")
    set diff (math "$local_size - $preact_size")
    if test $diff -gt 0
        printf "  → Local is %.2fx the size of Preact (+%d bytes)\n" $ratio $diff
    else
        set abs_diff (math "abs($diff)")
        printf "  → Local is %.2fx the size of Preact (-%d bytes)\n" $ratio $abs_diff
    end
else
    echo "  → Error: Preact bundle failed to generate"
end

echo ""
echo "Gzipped:"
set local_gz (gzip -c /tmp/bundle_local.min.js | wc -c | string trim)
set preact_gz (gzip -c /tmp/bundle_preact.min.js | wc -c | string trim)

echo "  Local Signals:  $local_gz bytes"
echo "  Preact Signals: $preact_gz bytes"

if test $preact_gz -gt 0
    set ratio_gz (math "$local_gz / $preact_gz")
    set diff_gz (math "$local_gz - $preact_gz")
    if test $diff_gz -gt 0
        printf "  → Local is %.2fx the size of Preact (+%d bytes)\n" $ratio_gz $diff_gz
    else
        set abs_diff_gz (math "abs($diff_gz)")
        printf "  → Local is %.2fx the size of Preact (-%d bytes)\n" $ratio_gz $abs_diff_gz
    end
else
    echo "  → Error: Preact bundle failed to generate"
end

echo ""
echo "✨ Bundle size analysis complete!"

echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf /tmp/bundle_local.min.js /tmp/bundle_preact.min.js /tmp/preact_entry.js /tmp/node_modules /tmp/package.json /tmp/package-lock.json

