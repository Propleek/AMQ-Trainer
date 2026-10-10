import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : le site fonctionne quel que soit le sous-chemin de déploiement
  // (GitHub Pages sert un dépôt de projet sous https://<utilisateur>.github.io/<dépôt>/).
  base: './',
})
