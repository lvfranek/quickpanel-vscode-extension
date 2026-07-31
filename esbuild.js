const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

/** Copy editable webview assets into media/ (what the VSIX ships). */
function syncMediaAssets() {
	const templateSrc = path.join(__dirname, 'src', 'webview', 'template.html');
	const templateDest = path.join(__dirname, 'media', 'template.html');
	if (fs.existsSync(templateSrc)) {
		fs.copyFileSync(templateSrc, templateDest);
	}
}

async function main() {
	syncMediaAssets();

	const hostCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	const webviewCtx = await esbuild.context({
		entryPoints: ['webview-src/main.js'],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'media/webview.js',
		logLevel: 'silent',
		// acquireVsCodeApi is provided by the webview host at runtime
		plugins: [],
	});

	if (watch) {
		// Re-copy template on rebuild is enough for most HTML edits; CSS is already in media/
		const templatePath = path.join(__dirname, 'src', 'webview', 'template.html');
		fs.watchFile(templatePath, { interval: 300 }, () => {
			syncMediaAssets();
			console.log('[watch] synced media/template.html');
		});
		await Promise.all([hostCtx.watch(), webviewCtx.watch()]);
	} else {
		await Promise.all([hostCtx.rebuild(), webviewCtx.rebuild()]);
		await Promise.all([hostCtx.dispose(), webviewCtx.dispose()]);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
