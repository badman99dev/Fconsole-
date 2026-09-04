import Tool from '../DevTools/Tool'
import LunaDataGrid from 'luna-data-grid'
import each from 'licia/each'
import ajax from 'licia/ajax'
import evalCss from '../lib/evalCss'
import emitter from '../lib/emitter'
import { classPrefix as c } from '../lib/util'

export default class Code extends Tool {
  constructor() {
    super()

    this._style = evalCss(require('./Code.scss'))

    this.name = 'code'
    this._selectedItem = null
    this._fileData = []
  }
  init($el, container) {
    super.init($el)

    this._container = container
    this._initTpl()

    this._dataGrid = new LunaDataGrid(this._$dataGrid.get(0), {
      columns: [
        {
          id: 'type',
          title: 'Type',
          weight: 20,
        },
        {
          id: 'name',
          title: 'Name',
          weight: 80,
        },
      ],
      minHeight: 60,
      maxHeight: 400,
    })

    this._bindEvent()
    this.refresh()
  }
  show() {
    super.show()
    this.refresh()

    return this
  }
  destroy() {
    super.destroy()

    evalCss.remove(this._style)
    emitter.off(emitter.SCALE, this._updateGridHeight)
  }
  refresh() {
    const dataGrid = this._dataGrid

    this._collectFiles()
    dataGrid.clear()

    each(this._fileData, (file, idx) => {
      dataGrid.append(
        {
          type: file.type,
          name: file.name,
          _idx: idx,
        },
        {
          selectable: true,
        }
      )
    })

    this._selectedItem = null
    this._updateButtons()
  }
  _collectFiles() {
    const files = []

    files.push({
      type: 'HTML',
      name: 'index.html',
      inline: false,
      isPage: true,
    })

    each(document.scripts, (script, i) => {
      if (script.src) {
        files.push({
          type: 'JS',
          name: this._pathOrUrl(script.src),
          url: script.src,
          inline: false,
        })
      } else if (script.textContent.trim()) {
        files.push({
          type: 'JS (inline)',
          name: `inline-script-${i}.js`,
          content: script.textContent,
          inline: true,
        })
      }
    })

    let inlineStyleCount = 0
    each(document.styleSheets, (sheet) => {
      const href = sheet.href

      if (href) {
        files.push({
          type: 'CSS',
          name: this._pathOrUrl(href),
          url: href,
          inline: false,
        })
      } else {
        let content = ''
        try {
          each(sheet.cssRules, (rule) => {
            content += rule.cssText + '\n'
          })
        } catch {
          content = (sheet.ownerNode && sheet.ownerNode.textContent) || ''
        }
        if (content.trim()) {
          files.push({
            type: 'CSS (inline)',
            name: `inline-style-${inlineStyleCount++}.css`,
            content,
            inline: true,
          })
        }
      }
    })

    this._fileData = files
  }
  _basename(url, fallback) {
    try {
      const path = new URL(url, location.href).pathname
      const name = path.substring(path.lastIndexOf('/') + 1)
      return name || fallback
    } catch {
      return fallback
    }
  }
  _pathOrUrl(url) {
    try {
      const u = new URL(url, location.href)
      if (u.origin === location.origin) {
        return u.pathname + u.search
      }
      return u.href
    } catch {
      return url
    }
  }
  _updateButtons() {
    const $container = this._$el
    const $download = $container.find(c('.download-file'))
    const btnDisabled = c('btn-disabled')

    $download.addClass(btnDisabled)

    if (this._selectedItem !== null) {
      $download.rmClass(btnDisabled)
    }
  }
  _initTpl() {
    const $el = this._$el

    $el.html(
      c(`<div class="code">
        <h2 class="title">
          Code
          <div class="btn download-all">
            <span class="icon icon-copy"></span> Download All HTML
          </div>
          <div class="btn refresh-code">
            <span class="icon icon-refresh"></span>
          </div>
          <div class="btn download-file btn-disabled">
            <span class="icon icon-copy"></span> Download Selected
          </div>
        </h2>
        <div class="data-grid"></div>
      </div>`)
    )

    this._$dataGrid = $el.find(c('.data-grid'))
  }
  _bindEvent() {
    this._$el
      .on('click', c('.download-all'), this._downloadAllHtml)
      .on('click', c('.refresh-code'), () => {
        this.refresh()
        this._container.notify('Refreshed', { icon: 'success' })
      })
      .on('click', c('.download-file'), this._downloadSelected)

    this._dataGrid
      .on('select', (node) => {
        this._selectedItem = node.data._idx
        this._updateButtons()
      })
      .on('deselect', () => {
        this._selectedItem = null
        this._updateButtons()
      })

    emitter.on(emitter.SCALE, this._updateGridHeight)
  }
  _updateGridHeight = (scale) => {
    this._dataGrid.setOption({
      minHeight: 60 * scale,
      maxHeight: 400 * scale,
    })
  }
  _downloadAllHtml = () => {
    ajax({
      url: location.href,
      success: (data) => this._triggerDownload(data, 'index.html'),
      error: () =>
        this._triggerDownload(
          '<!DOCTYPE html>\n' + document.documentElement.outerHTML,
          'index.html'
        ),
      dataType: 'raw',
    })
  }
  _downloadSelected = () => {
    if (this._selectedItem === null) return

    const file = this._fileData[this._selectedItem]
    if (!file) return

    if (file.isPage) {
      return this._downloadAllHtml()
    }

    if (file.inline) {
      this._triggerDownload(file.content, file.name.replace(/^\//, ''))
      return
    }

    ajax({
      url: file.url,
      success: (data) => this._triggerDownload(data, this._basename(file.url, file.name)),
      error: () =>
        this._container.notify('Failed to fetch file', { icon: 'error' }),
      dataType: 'raw',
    })
  }
  _triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    setTimeout(() => URL.revokeObjectURL(url), 1000)

    this._container.notify('Downloaded', { icon: 'success' })
  }
}
