import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  assetsInclude: ['**/*.glb', '**/*.jpg'], // 3D 모델과 이미지 파일 포함
  server: {
    port: 8080  // 포트 다시 8080으로 설정
  },
  build: {
    assetsDir: 'assets',
    copyPublicDir: true, // public 디렉토리의 파일들을 복사
    rollupOptions: {
      input: {
        main: '/index.html',
        error: '/error.html'  // error.html 추가
      }
    }
  },
  publicDir: 'public' // public 디렉토리 명시적 설정
})