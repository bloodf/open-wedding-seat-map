/**
 * Purpose: Initializes the bundled editor translations for local language
 *          switching without network-loaded locale files.
 *
 * Public API: default i18n instance and SUPPORTED_LOCALES.
 *
 * Upstream deps: i18next and react-i18next initReactI18next adapter.
 *
 * Downstream consumers: main bootstrap and editor React components.
 *
 * Failure modes: unknown locale codes fall back to English; initialization is
 *                synchronous because resources are bundled with the app.
 *
 * Performance: standard i18next in-memory resource lookup.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { LocaleCode } from './domain/types'

export const SUPPORTED_LOCALES: LocaleCode[] = ['en', 'pt-BR', 'es']

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        brandSubtitle: 'Operational seating editor',
        map: 'Map',
        status: {
          localDraft: 'Local draft',
          saved: 'Saved locally',
          autosaved: 'Autosaved locally',
          saveUnavailable: 'Local save unavailable',
          importedScene: 'Scene imported',
          importedGuests: 'Guests imported',
          importedBackground: 'SVG background imported',
          exported: '{{format}} exported',
          autoSeated: 'Auto seating applied',
          autoSeatConflicts: 'Auto seating applied with {{count}} conflicts',
          shareReady: 'Local share URL ready',
          importFailed: 'Import failed: {{message}}',
          exportFailed: 'Export failed: {{message}}',
          shareFailed: 'Share failed: {{message}}',
        },
        actions: {
          newMap: 'New',
          share: 'Share',
          import: 'Import',
          exportJson: 'JSON',
          exportCsv: 'CSV',
          exportSvg: 'SVG',
          exportPdf: 'PDF',
          save: 'Save',
          autoSeat: 'Auto Seat',
          importGuests: 'Import Guests',
          guestList: 'Guest List',
          seatAssistant: 'Seat Assistant',
        },
        labels: {
          saveStatus: 'Save status',
          language: 'Language',
          shareUrl: 'Local share URL',
          editorTools: 'Editor tools',
          guestsSeating: 'Guests & Seating',
          views: 'Views',
          objects: 'Objects',
          unassigned: 'Unassigned',
          guests: 'Guests',
          seated: 'Seated',
          balance: 'Balance',
          grid: 'Grid',
          showLabels: 'Show labels',
          floorplan: 'Floorplan',
          guestListView: 'Guest List View',
        },
      },
    },
    'pt-BR': {
      translation: {
        brandSubtitle: 'Editor operacional de mesas',
        map: 'Mapa',
        status: {
          localDraft: 'Rascunho local',
          saved: 'Salvo localmente',
          autosaved: 'Salvo automaticamente',
          saveUnavailable: 'Salvamento local indisponivel',
          importedScene: 'Cena importada',
          importedGuests: 'Convidados importados',
          importedBackground: 'Fundo SVG importado',
          exported: '{{format}} exportado',
          autoSeated: 'Distribuicao aplicada',
          autoSeatConflicts: 'Distribuicao aplicada com {{count}} conflitos',
          shareReady: 'URL de compartilhamento local pronta',
          importFailed: 'Falha ao importar: {{message}}',
          exportFailed: 'Falha ao exportar: {{message}}',
          shareFailed: 'Falha ao compartilhar: {{message}}',
        },
        actions: {
          newMap: 'Novo',
          share: 'Compartilhar',
          import: 'Importar',
          exportJson: 'JSON',
          exportCsv: 'CSV',
          exportSvg: 'SVG',
          exportPdf: 'PDF',
          save: 'Salvar',
          autoSeat: 'Distribuir',
          importGuests: 'Importar convidados',
          guestList: 'Lista de convidados',
          seatAssistant: 'Assistente',
        },
        labels: {
          saveStatus: 'Status de salvamento',
          language: 'Idioma',
          shareUrl: 'URL de compartilhamento local',
          editorTools: 'Ferramentas do editor',
          guestsSeating: 'Convidados e mesas',
          views: 'Visualizacoes',
          objects: 'Objetos',
          unassigned: 'Sem mesa',
          guests: 'Convidados',
          seated: 'Sentados',
          balance: 'Equilibrio',
          grid: 'Grade',
          showLabels: 'Mostrar rotulos',
          floorplan: 'Planta',
          guestListView: 'Lista de convidados',
        },
      },
    },
    es: {
      translation: {
        brandSubtitle: 'Editor operativo de mesas',
        map: 'Mapa',
        status: {
          localDraft: 'Borrador local',
          saved: 'Guardado localmente',
          autosaved: 'Autoguardado local',
          saveUnavailable: 'Guardado local no disponible',
          importedScene: 'Escena importada',
          importedGuests: 'Invitados importados',
          importedBackground: 'Fondo SVG importado',
          exported: '{{format}} exportado',
          autoSeated: 'Asignacion automatica aplicada',
          autoSeatConflicts: 'Asignacion aplicada con {{count}} conflictos',
          shareReady: 'URL local para compartir lista',
          importFailed: 'Error al importar: {{message}}',
          exportFailed: 'Error al exportar: {{message}}',
          shareFailed: 'Error al compartir: {{message}}',
        },
        actions: {
          newMap: 'Nuevo',
          share: 'Compartir',
          import: 'Importar',
          exportJson: 'JSON',
          exportCsv: 'CSV',
          exportSvg: 'SVG',
          exportPdf: 'PDF',
          save: 'Guardar',
          autoSeat: 'Auto sentar',
          importGuests: 'Importar invitados',
          guestList: 'Lista de invitados',
          seatAssistant: 'Asistente',
        },
        labels: {
          saveStatus: 'Estado de guardado',
          language: 'Idioma',
          shareUrl: 'URL local para compartir',
          editorTools: 'Herramientas del editor',
          guestsSeating: 'Invitados y mesas',
          views: 'Vistas',
          objects: 'Objetos',
          unassigned: 'Sin asignar',
          guests: 'Invitados',
          seated: 'Sentados',
          balance: 'Balance',
          grid: 'Cuadricula',
          showLabels: 'Mostrar etiquetas',
          floorplan: 'Plano',
          guestListView: 'Lista de invitados',
        },
      },
    },
  },
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LOCALES,
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
