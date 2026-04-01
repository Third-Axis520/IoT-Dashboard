# IoT Dashboard

A high-fidelity IIoT process control dashboard built with React 19, Vite 6, TypeScript, Tailwind CSS 4, and Recharts.

## Run Locally

**Prerequisites:** Node.js (v18+)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Create a `.env.local` file for environment variables:
   ```bash
   cp .env.example .env.local
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run clean` | Remove `dist/` directory |
| `npm run lint` | TypeScript type-checking (strict mode) |
