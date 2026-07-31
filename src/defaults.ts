import type { FileTemplate, ProjectType } from './models';

const DEFAULT_ENV_CONTENT = "NODE_ENV=development\n";

const DEFAULT_AGENTS_MD = `# CRITICAL RULES - MUST FOLLOW
## RESPONSES
- Keep responses concise and to the point - unless the user asks otherwise
## PLANNING MODE
- Always ask clarifying questions
- Never assume design, tech stack or features
- Use deep-dive sub-agents to assist with research
- Use deep-dive sub-agents to review the different aspects of your plan before presenting to the user
## CHANGE / EDIT MODE
- Never implement features yourself when possible - use sub-agents!
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently
- When using sub-agents to implement features, act as a coordinator only
- Use the best model for the task - premium models for complex tasks (like coding) and mid-tier models for simpler tasks, like documentation
- After completing features (large or small), always run commands like lint, type check and next build to check code quality
## DATABASE SCHEMA CHANGES
- Whenever you make changes to the database schema, ALWAYS run the drizzle generate and migrate commands
- NEVER run drizzle push!
- For all ID columns NOT related to BetterAuth, use UUID for the ID columns and be randomly generated
## TESTING
- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped.
## UI DESIGN
- Always follow the UI design system when creating or reviewing components or pages.
- Design System: @DESIGN.md
`;

const DEFAULT_GITIGNORE = `### macOS ###
# General
.DS_Store
.AppleDouble
.LSOverride

# Icon must end with two \\r
Icon\r\r

# Thumbnails
._*

# Files that might appear in the root of a volume
.DocumentRevisions-V100
.fseventsd
.Spotlight-V100
.TemporaryItems
.Trashes
.VolumeIcon.icns
.com.apple.timemachine.donotpresent

# Directories potentially created on remote AFP share
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apdisk

### macOS Patch ###
# iCloud generated files
*.icloud

### Windows ###
# Windows thumbnail cache files
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db

# Dump file
*.stackdump

# Folder config file
[Dd]esktop.ini

# Recycle Bin used on file shares
$RECYCLE.BIN/

# Windows Installer files
*.cab
*.msi
*.msix
*.msm
*.msp

# Windows shortcuts
*.lnk

# Environment
.env
`;

export function getDefaultFiles(): FileTemplate[] {
	return [
		{ id: "1", name: "README.md", filename: "README.md", content: "# Project\n" },
		{ id: "2", name: "AGENTS.md", filename: "AGENTS.md", content: DEFAULT_AGENTS_MD },
		{ id: "3", name: ".gitignore", filename: ".gitignore", content: DEFAULT_GITIGNORE },
		{ id: "4", name: ".env", filename: ".env", content: DEFAULT_ENV_CONTENT }
	];
}

export function getDefaultProjects(): ProjectType[] {
	return [
		// ── Single-line terminal commands ──
		{
			id: "quick1",
			name: "npm run dev",
			description: "Start the development server",
			kind: "terminal",
			favorite: true,
			steps: [
				{
					id: "q1s1",
					label: "Start development server",
					type: "command",
					command: "npm run dev"
				}
			]
		},
		{
			id: "skill1",
			name: "Install React best practices AI skill",
			description: "Installs vercel-react-best-practices into .agents/skills via the skills CLI",
			kind: "terminal",
			favorite: false,
			steps: [
				{
					id: "sk1s1",
					label: "Install React best practices skill",
					type: "command",
					command: "npx -y skills add vercel-labs/agent-skills --skill vercel-react-best-practices"
				}
			]
		},
		// ── Multi-step processes ──
		// Scaffolders must run in a mostly empty folder.
		// File steps come AFTER the scaffold so Run All waits for it to finish.
		{
			id: "proj-react",
			name: "Create React App",
			description: "Scaffold a React + TypeScript Vite app, install deps, add .env",
			kind: "process",
			favorite: false,
			steps: [
				{
					id: "pr1",
					label: "Create a new React TypeScript project with Vite in the current folder",
					type: "command",
					command: "npm create vite@latest . -- --template react-ts"
				},
				{
					id: "pr2",
					label: "Install project dependencies",
					type: "command",
					command: "npm install"
				},
				{
					id: "pr3",
					label: "Add a .env file with VITE_APP_NAME for client-side config",
					type: "file",
					filename: ".env",
					content: "VITE_APP_NAME=my-app\n"
				}
			]
		}
	];
}
