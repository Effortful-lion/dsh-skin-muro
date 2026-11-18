/**
 * Browser half of dsh-skin-muro: the "Muro 影幕" settings section.
 *
 * The catalog loads on its own. Selecting a card only selects it; the single
 * 下载资源 button fetches the 4K master once, freezes one frame into the local
 * library (progress bar while it runs) and from then on the card carries the
 * two actions that matter: 设为暗色壁纸 / 设为亮色壁纸, which are instant local
 * copies followed by an apply + reload.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skin-muro',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement

    const inject = ['slots']
    const STYLE_ID = 'dsh-skin-muro/style'
    const STATE_URL = '/muro/state'
    const CATALOG_URL = '/muro/catalog'
    const DOWNLOAD_URL = '/muro/download'
    const APPLY_URL = '/muro/apply'
    const JOB_URL = '/muro/job'
    const APPEARANCE_URL = '/muro/appearance'
    const SKIN_CSS_URL = '/muro/skin.css'
    const SKIN_LINK_ID = 'dsh-skin-muro/skin'

    const CSS = [
      '.muro{--muro-line:var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:16px;padding:2px 2px 28px;font-variant-numeric:tabular-nums}',
      '.muroBar{position:sticky;top:0;z-index:2;display:flex;flex-direction:column;gap:12px;padding:12px 0;background:linear-gradient(180deg,var(--dsw-alias-bg-base) 70%,transparent)}',
      '.muroTop{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}',
      '.muroTabs{display:inline-flex;padding:3px;gap:3px;border-radius:11px;border:1px solid var(--muro-line);background:var(--dsw-alias-bg-layer-1)}',
      '.muroTab{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;padding:5px 12px;border-radius:8px;cursor:pointer;transition:background .18s ease,color .18s ease}',
      '.muroTab[data-on="true"]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}',
      '.muroInput,.muroSelect{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--muro-line);border-radius:10px;padding:7px 11px;font:inherit;font-size:13px;transition:border-color .18s ease,box-shadow .18s ease}',
      '.muroInput:focus,.muroSelect:focus{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent)}',
      '.muroInput{flex:1 1 240px;min-width:200px}',
      '.muroMeta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.muroMeta b{color:var(--dsw-alias-label-secondary);font-weight:500}',
      '.muroDot{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.5}',
      '.muroBtn{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border:0;border-radius:9px;padding:7px 14px;font:inherit;font-size:12.5px;cursor:pointer;transition:filter .18s ease,transform .18s ease}',
      '.muroBtn:hover:not([disabled]){filter:brightness(1.06)}',
      '.muroBtn:active:not([disabled]){transform:translateY(1px)}',
      '.muroBtn[disabled]{opacity:.45;cursor:default}',
      '.muroGhost{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--muro-line);border-radius:9px;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer;transition:background .18s ease,border-color .18s ease}',
      '.muroGhost:hover:not([disabled]){background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-border-l3)}',
      '.muroGhost[disabled]{opacity:.45;cursor:default}',
      '.muroError{color:var(--dsw-alias-state-error-primary);font-size:12.5px;line-height:1.6;padding:9px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent)}',
      '.muroHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6}',
      '.muroSlider{width:180px;accent-color:var(--dsw-alias-brand-primary)}',
      '.muroGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:14px}',
      '.muroCard{position:relative;border:1px solid var(--muro-line);border-radius:14px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;cursor:pointer;transition:transform .2s cubic-bezier(.2,.7,.3,1),box-shadow .2s ease,border-color .2s ease}',
      '.muroCard:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgb(0 0 0 / 18%);border-color:var(--dsw-alias-border-l3)}',
      '.muroCard[data-sel="true"]{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary),0 12px 30px rgb(0 0 0 / 22%)}',
      '.muroShot{position:relative;aspect-ratio:16/9;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.muroShot img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s ease}',
      '.muroCard:hover .muroShot img{transform:scale(1.03)}',
      '.muroChip{position:absolute;top:8px;left:8px;font-size:10.5px;letter-spacing:.02em;padding:2px 7px;border-radius:999px;background:rgb(0 0 0 / 55%);color:#fff;backdrop-filter:blur(6px)}',
      '.muroLocal{position:absolute;top:8px;right:8px;font-size:10.5px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}',
      '.muroBody{padding:9px 11px 11px;display:flex;flex-direction:column;gap:6px}',
      '.muroName{font-size:12.5px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.muroSub{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.muroActions{display:flex;gap:6px;margin-top:2px}',
      '.muroActions>*{flex:1}',
      '.muroProgress{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);overflow:hidden;margin-top:2px}',
      '.muroProgress i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--dsw-alias-brand-primary),color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,#fff));transition:width .25s ease}',
      '.muroProgress[data-indeterminate="true"] i{width:38%!important;animation:muroSlide 1.1s ease-in-out infinite}',
      '@keyframes muroSlide{0%{transform:translateX(-60%)}100%{transform:translateX(260%)}}',
      '.muroSkeleton{border-radius:14px;height:196px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-1),var(--dsw-alias-bg-layer-3),var(--dsw-alias-bg-layer-1));background-size:200% 100%;animation:muroShimmer 1.4s linear infinite}',
      '@keyframes muroShimmer{0%{background-position:0 0}100%{background-position:-200% 0}}',
      '.muroEmpty{padding:26px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px}',
      '.muroPanel{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:10px}',
      '.muroPanelHead{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}',
      '.muroPanelTitle{font-size:12.5px;color:var(--dsw-alias-label-primary)}',
      '.muroChips{display:flex;flex-wrap:wrap;gap:6px}',
      '.muroChipBtn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:3px 10px;font:inherit;font-size:11.5px;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease}',
      '.muroChipBtn:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}',
      '.muroChipBtn[data-on="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}',
      '.muroControls{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px 16px}',
      '.muroControl{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px}',
      '.muroControlName{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.muroControl input[type=range]{width:100%;accent-color:var(--dsw-alias-brand-primary)}',
      '.muroControlValue{font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:38px;text-align:right}',
      '.muroPositions{display:flex;gap:8px;align-items:center}',
      '@media (prefers-reduced-motion:reduce){.muroCard,.muroShot img,.muroProgress i{transition:none}.muroProgress[data-indeterminate="true"] i{animation:none;width:100%!important}}',
    ].join('\n')

    function installStyle() {
      if (document.getElementById(STYLE_ID) !== null) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.append(style)
      return () => style.remove()
    }

    // The skin-center does not apply user-directory skins on this build, so the
    // page paints the skin itself: one stylesheet from this plugin's own route,
    // scoped to html[data-muro-skin]. No /api call, no skin-center dependency.
    function paintSkin() {
      const href = `${SKIN_CSS_URL}?v=${Date.now()}`
      const existing = document.getElementById(SKIN_LINK_ID)
      document.documentElement.setAttribute('data-muro-skin', 'muro')
      if (existing !== null) {
        existing.href = href
        return existing
      }
      syncThemeAttribute()
      const link = document.createElement('link')
      link.id = SKIN_LINK_ID
      link.rel = 'stylesheet'
      link.href = href
      link.addEventListener('load', syncThemeAttribute)
      document.head.append(link)
      return link
    }

    /** The shell marks dark mode on html or body depending on version; decide
     *  once here and let our own attribute drive the CSS. */
    function readTheme() {
      // The shell's dark marker moved between versions and is not reliable here;
      // the text ink it ends up using is. Light ink means a dark theme.
      try {
        const ink = getComputedStyle(document.body).color.match(/rgba?\(([^)]+)\)/)
        if (ink !== null) {
          const [r, g, b] = ink[1].split(',').map(Number)
          return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? 'dark' : 'light'
        }
      } catch {
        // fall through to the system preference
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    function syncThemeAttribute() {
      document.documentElement.setAttribute('data-muro-theme', readTheme())
    }

    function watchTheme() {
      syncThemeAttribute()
      const observer = new MutationObserver(syncThemeAttribute)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] })
      if (document.body !== null) {
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] })
      }
      return () => observer.disconnect()
    }

    function unpaintSkin() {
      document.getElementById(SKIN_LINK_ID)?.remove()
      document.documentElement.removeAttribute('data-muro-skin')
    }

    const CONTROLS = [
      { key: 'veil', label: '压暗', min: 0, max: 80, unit: '%', hint: '提亮文字与壁纸的反差' },
      { key: 'blur', label: '模糊', min: 0, max: 24, unit: 'px', hint: '柔化壁纸细节' },
      { key: 'brightness', label: '亮度', min: 50, max: 130, unit: '%' },
      { key: 'saturate', label: '饱和', min: 0, max: 160, unit: '%' },
      { key: 'contrast', label: '对比', min: 80, max: 140, unit: '%' },
      { key: 'grayscale', label: '灰度', min: 0, max: 100, unit: '%' },
      { key: 'panel', label: '面板', min: 0, max: 85, unit: '%', hint: '面板不透明度：越高越压住壁纸、越好读' },
    ]
    const POSITIONS = [
      { value: 'center', label: '居中' },
      { value: 'top', label: '上' },
      { value: 'bottom', label: '下' },
    ]
    const PRESETS = [
      { id: 'soft', label: '柔和', settings: { veil: 24, blur: 0, brightness: 100, saturate: 105, contrast: 100, grayscale: 0, panel: 32 } },
      { id: 'standard', label: '标准', settings: { veil: 42, blur: 0, brightness: 100, saturate: 105, contrast: 100, grayscale: 0, panel: 46 } },
      { id: 'strong', label: '强反差', settings: { veil: 62, blur: 5, brightness: 92, saturate: 100, contrast: 102, grayscale: 0, panel: 62 } },
    ]

    /** Paint the live values as custom properties: the stylesheet reads them, so
     *  a slider move costs no request and no repaint of the stylesheet. */
    function activeTheme() {
      return document.documentElement.getAttribute('data-muro-theme') === 'light' ? 'light' : 'dark'
    }

    /** A dark wallpaper needs almost no veil to stay readable, a bright one needs
     *  a lot: derive the default from the picture's own mean luma. */
    function autoVeil(luma) {
      if (!Number.isFinite(luma)) return 42
      return Math.min(78, Math.max(14, Math.round((luma / 255) * 70 + 12)))
    }

    function effectiveVeil(settings, luma) {
      if (settings?.auto !== false) return autoVeil(luma)
      return Math.min(80, Math.max(0, Number(settings?.veil) || 0))
    }

    function applyVars(settings, luma) {
      if (settings === null || settings === undefined) return
      const root = document.documentElement
      const veil = effectiveVeil(settings, luma) / 100
      const blur = Math.min(24, Math.max(0, Number(settings.blur) || 0))
      const panel = Math.min(85, Math.max(0, Number(settings.panel) || 0)) / 100
      root.style.setProperty('--muro-panel', String(panel))
      root.style.setProperty('--muro-veil', String(veil))
      root.style.setProperty('--muro-blur', `${blur}px`)
      root.style.setProperty('--muro-scale', String(1 + blur / 200))
      root.style.setProperty('--muro-bright', String((Number(settings.brightness) || 100) / 100))
      root.style.setProperty('--muro-sat', String((Number(settings.saturate) || 100) / 100))
      root.style.setProperty('--muro-contrast', String((Number(settings.contrast) || 100) / 100))
      root.style.setProperty('--muro-gray', String((Number(settings.grayscale) || 0) / 100))
      root.style.setProperty('--muro-pos', ['center', 'top', 'bottom'].includes(settings.position) ? settings.position : 'center')
    }

    async function getJson(url) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      const body = await response.json().catch(() => ({ ok: false, error: `http ${response.status}` }))
      if (!response.ok || body.ok !== true) throw new Error(body.error ?? `http ${response.status}`)
      return body
    }

    async function postJson(url, payload, timeout) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeout ?? 30_000),
      })
      const body = await response.json().catch(() => ({ ok: false, error: `http ${response.status}` }))
      if (!response.ok || body.ok !== true) throw new Error(body.error ?? `http ${response.status}`)
      return body
    }

    function megabytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '—'
      return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`
    }

    function MuroSection() {
      const [state, setState] = React.useState(null)
      const [catalog, setCatalog] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [category, setCategory] = React.useState('')
      const [localOnly, setLocalOnly] = React.useState(false)
      const [selected, setSelected] = React.useState(null)
      const [progress, setProgress] = React.useState({})
      const [settings, setSettings] = React.useState(null)
      const [editingCache, setEditingCache] = React.useState(false)
      const [cacheDraft, setCacheDraft] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [failure, setFailure] = React.useState('')
      const [note, setNote] = React.useState('')

      const refreshState = React.useCallback(async () => {
        try {
          setState(await getJson(STATE_URL))
        } catch (error) {
          setFailure(String(error.message ?? error))
        }
      }, [])

      const loadCatalog = React.useCallback(async (nextQuery, nextCategory, nextLocal) => {
        try {
          const params = new URLSearchParams()
          const term = (nextQuery ?? '').trim()
          if (term !== '') params.set('q', term)
          if ((nextCategory ?? '') !== '') params.set('category', nextCategory)
          if (nextLocal === true) params.set('local', '1')
          setCatalog(await getJson(`${CATALOG_URL}?${params.toString()}`))
          setFailure('')
        } catch (error) {
          setFailure(`目录加载失败：${error.message ?? error}`)
        }
      }, [])

      React.useEffect(() => { void refreshState() }, [refreshState])
      React.useEffect(() => { void loadCatalog('', '', false) }, [loadCatalog])

      const appearanceOn = state?.appearance?.enabled === true

      React.useEffect(() => {
        const stored = state?.appearance?.settings
        if (stored === undefined || stored === null) return
        setSettings(current => current ?? stored)
        applyVars(stored, state?.wallpapers?.[activeTheme()]?.luma)
      }, [state])

      const saveTimer = React.useRef(null)
      function changeSetting(key, value) {
        setSettings(current => {
          const next = { ...(current ?? {}), [key]: value }
          applyVars(next, state?.wallpapers?.[activeTheme()]?.luma)
          if (saveTimer.current !== null) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => {
            void postJson(APPEARANCE_URL, { settings: next }).catch(error => setFailure(String(error.message ?? error)))
          }, 320)
          return next
        })
      }

      function applyPreset(preset) {
        const next = { ...(settings ?? {}), ...preset.settings, auto: false }
        setSettings(next)
        applyVars(next, state?.wallpapers?.[activeTheme()]?.luma)
        void postJson(APPEARANCE_URL, { settings: next }).catch(error => setFailure(String(error.message ?? error)))
      }

      React.useEffect(() => {
        const timer = setTimeout(() => { void loadCatalog(query, category, localOnly) }, 240)
        return () => clearTimeout(timer)
      }, [query, category, localOnly, loadCatalog])

      const locals = state?.locals ?? []
      const localById = new Map(locals.map(entry => [entry.id, entry]))
      const active = state?.activeSkin === 'muro'

      async function download(item) {
        setProgress(current => ({ ...current, [item.id]: { stage: 'start', pct: 0 } }))
        setFailure('')
        try {
          const { jobId } = await postJson(DOWNLOAD_URL, { id: item.id })
          for (;;) {
            await new Promise(resolve => setTimeout(resolve, 400))
            const job = await getJson(`${JOB_URL}?id=${encodeURIComponent(jobId)}`)
            const pct = job.total > 0 ? Math.min(99, Math.round((job.received / job.total) * 100)) : 0
            setProgress(current => ({
              ...current,
              [item.id]: { stage: job.stage, pct: job.stage === 'freeze' ? 100 : pct, indeterminate: job.stage === 'freeze' },
            }))
            if (job.state === 'done') {
              setProgress(current => {
                const next = { ...current }
                delete next[item.id]
                return next
              })
              await refreshState()
              void loadCatalog(query, category, localOnly)
              return
            }
            if (job.state === 'error') throw new Error(job.error)
          }
        } catch (error) {
          setProgress(current => {
            const next = { ...current }
            delete next[item.id]
            return next
          })
          setFailure(`${item.title} 下载失败：${error.message ?? error}`)
        }
      }

      async function applyWallpaper(item, theme) {
        setBusy(`${item.id}:${theme}`)
        setFailure('')
        setNote(`正在把 ${item.title} 设为${theme === 'dark' ? '暗色' : '亮色'}壁纸…`)
        try {
          await postJson(APPLY_URL, { id: item.id, theme }, 60_000)
          await postJson(APPEARANCE_URL, { enabled: true }, 30_000)
          paintSkin()
          applyVars(settings ?? state?.appearance?.settings, state?.wallpapers?.[activeTheme()]?.luma)
          await refreshState()
          setNote(`${item.title} 已设为${theme === 'dark' ? '暗色' : '亮色'}壁纸`)
        } catch (error) {
          setFailure(`设置壁纸失败：${error.message ?? error}`)
          setNote('')
        } finally {
          setBusy('')
        }
      }

      async function openCacheFolder() {
        try {
          await postJson('/muro/cache', { open: true })
        } catch (error) {
          setFailure(`打开下载位置失败：${error.message ?? error}`)
        }
      }

      async function saveCacheFolder() {
        setBusy('cache')
        try {
          const body = await postJson('/muro/cache', { dir: cacheDraft }, 30_000)
          await refreshState()
          setEditingCache(false)
          setNote(`下载位置已改为 ${body.dir}`)
        } catch (error) {
          setFailure(`设置下载位置失败：${error.message ?? error}`)
        } finally {
          setBusy('')
        }
      }

      async function applySkin() {
        setBusy('apply')
        try {
          await postJson(APPEARANCE_URL, { enabled: true })
          await clearSkinCenterSelection()
          paintSkin()
          applyVars(settings ?? state?.appearance?.settings, state?.wallpapers?.[activeTheme()]?.luma)
          await refreshState()
          setNote('已启用 Muro 影幕外观')
        } catch (error) {
          setFailure(`启用外观失败：${error.message ?? error}`)
        } finally {
          setBusy('')
        }
      }

      async function restoreStock() {
        setBusy('restore')
        try {
          await postJson(APPEARANCE_URL, { enabled: false })
          unpaintSkin()
          await refreshState()
          setNote('已恢复原样')
        } catch (error) {
          setFailure(`恢复原样失败：${error.message ?? error}`)
        } finally {
          setBusy('')
        }
      }

      async function installSkin() {
        setBusy('install')
        try {
          await postJson('/muro/install', {}, 60_000)
          await refreshState()
          setNote('皮肤已安装到本地')
        } catch (error) {
          setFailure(`安装失败：${error.message ?? error}`)
        } finally {
          setBusy('')
        }
      }

      function card(item) {
        const local = localById.get(item.id) ?? (item.local ? { id: item.id, bytes: item.localBytes } : null)
        const job = progress[item.id]
        const isSelected = selected === item.id
        const working = busy === `${item.id}:dark` || busy === `${item.id}:light`

        let actions
        if (job !== undefined) {
          actions = null
        } else if (local === null) {
          actions = h('div', { className: 'muroActions' },
            h('button', {
              className: 'muroBtn',
              onClick: event => { event.stopPropagation(); void download(item) },
            }, '下载资源'))
        } else {
          actions = h('div', { className: 'muroActions' },
            h('button', {
              className: 'muroGhost',
              disabled: working,
              title: '设为暗色壁纸',
              onClick: event => { event.stopPropagation(); void applyWallpaper(item, 'dark') },
            }, busy === `${item.id}:dark` ? '应用…' : '设为暗色壁纸'),
            h('button', {
              className: 'muroGhost',
              disabled: working,
              title: '设为亮色壁纸',
              onClick: event => { event.stopPropagation(); void applyWallpaper(item, 'light') },
            }, busy === `${item.id}:light` ? '应用…' : '设为亮色壁纸'))
        }

        const bar = job === undefined
          ? null
          : h('div', {
              className: 'muroProgress',
              'data-indeterminate': String(job.indeterminate === true),
            }, h('i', { style: { width: `${job.indeterminate === true ? 38 : job.pct}%` } }))

        const status = job === undefined
          ? null
          : h('span', { className: 'muroSub' }, job.indeterminate === true ? '抽帧中…' : `下载中 ${job.pct}%`)

        return h('article', {
          key: item.id,
          className: 'muroCard',
          'data-sel': String(isSelected),
          onClick: () => setSelected(isSelected ? null : item.id),
        },
          h('div', { className: 'muroShot' },
            h('img', { src: item.thumbnail, alt: item.title, loading: 'lazy' }),
            h('span', { className: 'muroChip' }, item.category),
            local === null ? null : h('span', { className: 'muroLocal' }, '本地')),
          h('div', { className: 'muroBody' },
            h('span', { className: 'muroName', title: item.title }, item.title),
            h('span', { className: 'muroSub' },
              `${item.height >= 2000 ? '4K' : `${item.height}p`} · ${item.seconds}s · ${local === null ? `${item.megabytes} MB` : megabytes(local.bytes)}`),
            bar,
            status,
            actions))
      }

      const items = catalog?.items ?? []
      const categories = catalog?.categories ?? []
      const selectedItem = items.find(item => item.id === selected)

      return h('div', { className: 'muro' },
        h('div', { className: 'muroBar' },
          h('div', { className: 'muroTop' },
            h('div', { className: 'muroMeta' },
              state === null
                ? h('span', null, '读取中…')
                : state.installed
                  ? h('span', null,
                      h('b', null, 'Muro 影幕'),
                      h('span', { className: 'muroDot' }),
                      appearanceOn ? '外观已启用' : '外观未启用',
                      h('span', { className: 'muroDot' }),
                      `暗色 ${state.credits?.dark?.title ?? '—'}`,
                      h('span', { className: 'muroDot' }),
                      `亮色 ${state.credits?.light?.title ?? '—'}`)
                  : h('span', null, '皮肤未安装')),
            h('div', { className: 'muroMeta' },
              h('button', {
                className: 'muroBtn',
                disabled: busy !== '' || state?.installed !== true,
                onClick: () => void applySkin(),
              }, appearanceOn ? '外观已启用' : '启用外观'),
              h('button', {
                className: 'muroGhost',
                disabled: busy !== '' || !appearanceOn,
                onClick: () => void restoreStock(),
              }, '恢复原样'),
              state?.installed === false
                ? h('button', { className: 'muroGhost', disabled: busy !== '', onClick: () => void installSkin() }, '安装皮肤')
                : null)),
          h('div', { className: 'muroTop' },
            h('div', { className: 'muroTabs' },
              h('button', { className: 'muroTab', 'data-on': String(localOnly === false), onClick: () => setLocalOnly(false) },
                `全部 ${catalog?.total ?? 0}`),
              h('button', { className: 'muroTab', 'data-on': String(localOnly === true), onClick: () => setLocalOnly(true) },
                `本地 ${catalog?.localCount ?? locals.length}`)),
            h('input', {
              className: 'muroInput',
              placeholder: '搜索标题…',
              value: query,
              onChange: event => setQuery(event.target.value),
            }),
            h('select', {
              className: 'muroSelect',
              value: category,
              onChange: event => setCategory(event.target.value),
            },
              h('option', { value: '' }, '全部分类'),
              categories.map(name => h('option', { key: name, value: name }, name)))),
          h('div', { className: 'muroPanel' },
            h('div', { className: 'muroPanelHead' },
              h('span', { className: 'muroPanelTitle' }, '下载位置'),
              h('div', { className: 'muroChips' },
                h('button', { className: 'muroChipBtn', onClick: () => void openCacheFolder() }, '在访达中打开'),
                h('button', {
                  className: 'muroChipBtn',
                  onClick: () => {
                    setCacheDraft(state?.cache?.dir ?? '')
                    setEditingCache(current => !current)
                  },
                }, editingCache ? '取消' : '更改…'))),
            editingCache
              ? h('div', { className: 'muroControls' },
                  h('input', {
                    className: 'muroInput',
                    style: { flex: '1 1 100%' },
                    value: cacheDraft,
                    placeholder: '绝对路径，或用 ~ 开头；留空恢复默认',
                    onChange: event => setCacheDraft(event.target.value),
                  }),
                  h('div', { className: 'muroChips' },
                    h('button', { className: 'muroBtn', disabled: busy !== '', onClick: () => void saveCacheFolder() }, '保存'),
                    h('button', { className: 'muroChipBtn', onClick: () => setEditingCache(false) }, '取消')))
              : h('div', { className: 'muroMeta' },
                  h('span', null, h('b', null, state?.cache?.dir ?? '—')),
                  h('span', { className: 'muroDot' }),
                  h('span', null, `${state?.cache?.count ?? 0} 张 · ${megabytes(state?.cache?.bytes ?? 0)}`),
                  h('span', { className: 'muroDot' }),
                  h('span', null, '抽好的帧存在这里，换壁纸时直接复用'))),
          appearanceOn
            ? h('div', { className: 'muroPanel' },
                h('div', { className: 'muroPanelHead' },
                  h('span', { className: 'muroPanelTitle' }, '壁纸调节 · 提亮文字反差'),
                  h('div', { className: 'muroChips' },
                    PRESETS.map(preset => h('button', {
                      key: preset.id,
                      className: 'muroChipBtn',
                      onClick: () => applyPreset(preset),
                    }, preset.label)),
                    h('button', {
                      className: 'muroChipBtn',
                      'data-on': String(settings?.auto !== false),
                      onClick: () => {
                        const next = { ...(settings ?? {}), auto: true }
                        setSettings(next)
                        applyVars(next, state?.wallpapers?.[activeTheme()]?.luma)
                        void postJson(APPEARANCE_URL, { settings: next }).catch(error => setFailure(String(error.message ?? error)))
                      },
                    }, '自动'),
                    h('button', {
                      className: 'muroChipBtn',
                      onClick: () => {
                        const defaults = { auto: true, veil: 40, panel: 45, blur: 0, brightness: 100, saturate: 105, contrast: 100, grayscale: 0, position: 'center' }
                        setSettings(defaults)
                        applyVars(defaults, state?.wallpapers?.[activeTheme()]?.luma)
                        void postJson(APPEARANCE_URL, { settings: {} }).catch(error => setFailure(String(error.message ?? error)))
                      },
                    }, '重置'))),
                h('div', { className: 'muroControls' },
                  CONTROLS.map(control => h('label', {
                    className: 'muroControl',
                    key: control.key,
                    title: control.hint ?? '',
                  },
                    h('span', { className: 'muroControlName' }, control.label),
                    h('input', {
                      type: 'range',
                      min: control.min,
                      max: control.max,
                      disabled: control.key === 'veil' && settings?.auto !== false,
                      value: control.key === 'veil'
                        ? effectiveVeil(settings, state?.wallpapers?.[activeTheme()]?.luma)
                        : (settings?.[control.key] ?? control.min),
                      onChange: event => changeSetting(
                        control.key === 'veil' ? 'veil' : control.key,
                        Number(event.target.value),
                      ),
                    }),
                    h('span', { className: 'muroControlValue' },
                      `${control.key === 'veil'
                        ? effectiveVeil(settings, state?.wallpapers?.[activeTheme()]?.luma)
                        : (settings?.[control.key] ?? control.min)}${control.unit}`)))),
                h('div', { className: 'muroPositions' },
                  h('span', { className: 'muroControlName' }, '取景'),
                  POSITIONS.map(position => h('button', {
                    key: position.value,
                    className: 'muroChipBtn',
                    'data-on': String((settings?.position ?? 'center') === position.value),
                    onClick: () => changeSetting('position', position.value),
                  }, position.label))))
            : null,
          failure === '' ? null : h('div', { className: 'muroError' }, failure),
          note === '' ? null : h('div', { className: 'muroHint' }, note),
          selectedItem === undefined ? null : h('div', { className: 'muroHint' },
            `已选中 ${selectedItem.title} · ${selectedItem.category} · ${selectedItem.width}×${selectedItem.height}`)),
        catalog === null
          ? h('div', { className: 'muroGrid' }, Array.from({ length: 8 }, (_, index) => h('div', { className: 'muroSkeleton', key: index })))
          : items.length === 0
            ? h('div', { className: 'muroEmpty' }, localOnly ? '本地还没有壁纸，先下载一张。' : '没有匹配的壁纸。')
            : h('div', { className: 'muroGrid' }, items.map(card)))
    }

    /** The skin-center paints its own skin and backdrop when one is selected,
     *  and its layer sits above ours. Turning our look on therefore also clears
     *  that selection through the same API its card uses (the page is
     *  authenticated for it). Failure is not fatal. */
    async function clearSkinCenterSelection() {
      try {
        await fetch('/api/skin-center/v2/active', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ active: null }),
          signal: AbortSignal.timeout(8_000),
        })
      } catch {
        // Best effort: another skin staying on only costs a mixed look.
      }
    }

    let lastStamp = 0

    function watchStyle() {
      const timer = setInterval(async () => {
        try {
          const response = await fetch(STATE_URL, { signal: AbortSignal.timeout(10_000) })
          const state = await response.json()
          if (state?.appearance?.enabled !== true) return
          // Keep the live dials in sync with what is stored: a change made from
          // another session (or the API) lands within one tick, no reload.
          applyVars(state?.appearance?.settings, state?.wallpapers?.[activeTheme()]?.luma)
          const stamp = Number(state?.styleStamp) || 0
          if (stamp !== lastStamp) {
            lastStamp = stamp
            paintSkin()
          }
        } catch {
          // Offline or the host is restarting: the next tick retries.
        }
      }, 4_000)
      return () => clearInterval(timer)
    }

    async function syncAppearance() {
      try {
        const response = await fetch(STATE_URL, { signal: AbortSignal.timeout(15_000) })
        const state = await response.json()
        if (state?.appearance?.enabled === true) {
          await clearSkinCenterSelection()
          paintSkin()
        }
        // Editing the skin's CSS on disk repaints within a few seconds: the
        // host reports the stylesheet mtime, the page re-links on a change.
        lastStamp = Number(state?.styleStamp) || 0
      } catch {
        // Painting is best-effort at boot; the settings panel retries on demand.
      }
    }

    function apply(ctx) {
      ctx.effect(() => installStyle(), 'muro: settings styles')
      // Painted here, not in the settings component: the look has to be on the
      // page whether or not anyone opens the panel.
      ctx.effect(() => {
        const stopWatching = watchTheme()
        const stopPolling = watchStyle()
        void syncAppearance()
        return () => { stopWatching(); stopPolling(); unpaintSkin() }
      }, 'muro: appearance')
      ctx.slots.register({
        name: 'settings.section',
        id: 'muro',
        order: 520,
        label: () => 'Muro 影幕',
      }, MuroSection)
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})