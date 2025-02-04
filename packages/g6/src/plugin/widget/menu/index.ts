import { isString, uniqueId } from '@antv/util';
import insertCss from 'insert-css';
import Item from '../../../item/item';
import { Graph } from '../../../types';
import { IG6GraphEvent } from '../../../types/event';
import { Plugin as Base, IPluginBaseConfig } from '../../../types/plugin';
import { createDOM, modifyCSS } from '../../../utils/dom';

typeof document !== 'undefined' &&
  insertCss(`
  .g6-component-contextmenu {
    border: 1px solid #e2e2e2;
    border-radius: 4px;
    font-size: 12px;
    color: #545454;
    background-color: rgba(255, 255, 255, 0.9);
    padding: 10px 8px;
    box-shadow: rgb(174, 174, 174) 0px 0px 10px;
  }
  .g6-contextmenu-ul {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .g6-loading-dom {
    border: 5px solid #e5e5e5;
    border-top: 5px solid #227EFF;
    border-radius: 50%;
    width: 25px;
    height: 25px;
    animation: turn-around 1.5s linear infinite;
    }
    @keyframes turn-around {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`);
/**
 * The `MenuConfig` interface contains the following properties:
 * - `handleMenuClick`: An optional function for handling menu click events. It takes two arguments: `target` (of type HTMLElement) and `item` (of type Item), and has no return value.
 * - `getContent`: An optional function for getting the content of the menu. It takes an optional argument of type `IG6GraphEvent`, and returns a value of type HTMLElement, string, or Promise (resolving to HTMLElement or string).
 * - `offsetX`: An optional number representing the offset of the menu in the X direction.
 * - `offsetY`: An optional number representing the offset of the menu in the Y direction.
 * - `shouldBegin`: An optional function for determining whether the menu should be displayed. It takes an optional argument of type `IG6GraphEvent`, and returns a boolean value.
 * - `itemTypes`: An optional array of strings representing the types of items for which the menu is allowed to be displayed.
 * - `trigger`: An optional string, either 'click' or 'contextmenu', representing the event type that triggers the display of the menu.
 * - `onHide`: An optional function to be executed when the menu is hidden. It takes no arguments and returns a boolean value.
 * - `loadingContent`: An optional HTMLElement or string representing the loading DOM.
 * - `liHoverStyle`: An optional object representing the style of li elements when hovered over. It can contain any number of key-value pairs, where the key is a style name and the value is a string.
 */
export interface MenuConfig extends IPluginBaseConfig {
  handleMenuClick?: (target: HTMLElement, item: Item) => void;
  // return the content of menu, support the `Promise` type return value.
  getContent?: (evt?: IG6GraphEvent) => HTMLElement | string | Promise<HTMLElement | string>;
  offsetX?: number;
  offsetY?: number;
  shouldBegin?: (evt?: IG6GraphEvent) => boolean;
  itemTypes?: string[];
  trigger?: 'click' | 'contextmenu';
  onHide?: () => boolean;
  //loading Dom
  loadingContent?: HTMLElement | string;
  liHoverStyle?: { [key: string]: string };
}

export class Menu extends Base {
  private menu;
  private handleMenuClickWrapper;
  private handler;
  private currentTarget;
  private asyncMenu;
  constructor(options?: MenuConfig) {
    super(options);
  }

  public getDefaultCfgs(): MenuConfig {
    return {
      key: `menu-${uniqueId()}`,
      offsetX: 6,
      offsetY: 6,
      handleMenuClick: undefined,
      getContent: (e) => {
        return `
          <ul class='g6-contextmenu-ul'>
            <li class='g6-contextmenu-li'>菜单项1</li>
            <li class='g6-contextmenu-li'>菜单项2</li>
          </ul>
        `;
      },
      shouldBegin: (e) => {
        return true;
      },
      // hide menu
      onHide: () => {
        return true;
      },
      itemTypes: ['node', 'edge', 'combo'],
      trigger: 'click',
      container: null,
      loadingContent: `<div class='g6-loading-dom'></div>`,
      liHoverStyle: {
        color: 'white',
        'background-color': '#227EFF',
      },
    };
  }

  public getEvents() {
    return this.options.trigger === 'click'
      ? { click: this.onMenuShow, touchend: this.onMenuShow }
      : { contextmenu: this.onMenuShow };
  }

  public init(graph: Graph) {
    super.init(graph);
    const className = this.options.className;
    insertCss(`
            .g6-contextmenu-li:hover{
            ${Object.keys(this.options.liHoverStyle)
              .map((k) => {
                return `${k}:${this.options.liHoverStyle[k]};`;
              })
              .join('')}
            }
        `);
    const menu = createDOM(`<div class=${className || 'g6-component-contextmenu'}></div>`);
    modifyCSS(menu, { top: '0px', position: 'absolute', visibility: 'hidden' });
    let container: HTMLElement | null | string = this.options.container;
    if (!container) {
      container = this.graph.container as HTMLElement;
    }
    if (isString(container)) {
      container = document.getElementById(container) as HTMLElement;
    }
    container.appendChild(menu);
    this.menu = menu;
  }

  protected async onMenuShow(e: IG6GraphEvent) {
    const self = this;
    e.preventDefault?.();
    this.onMenuHide();
    const itemTypes = this.options.itemTypes;
    if (!e.itemId) {
      if (itemTypes.indexOf('canvas') === -1) {
        this.onMenuHide();
        return;
      }
    } else {
      if (e.itemId && e.itemType && itemTypes.indexOf(e.itemType) === -1) {
        this.onMenuHide();
        return;
      }
    }

    const shouldBegin = this.options.shouldBegin;
    if (!shouldBegin(e)) return;
    const menuDom = this.menu;
    const graph = this.graph;
    const menu = this.options.getContent(e);

    const width: number = graph.getSize()[0];
    const height: number = graph.getSize()[1];
    const bbox = menuDom.getBoundingClientRect();
    const offsetX = this.options.offsetX || 0;
    const offsetY = this.options.offsetY || 0;
    const graphTop = this.graph.container.offsetTop;
    const graphLeft = this.graph.container.offsetLeft;
    let x = e.viewport.x + graphLeft + offsetX;
    let y = e.viewport.y + graphTop + offsetY - 55;

    // when the menu is (part of) out of the canvas
    if (x + bbox.width > width) {
      x -= bbox.width + graphLeft + offsetX;
    }
    if (y + bbox.height > height) {
      y -= bbox.height + graphTop + offsetY;
    }
    modifyCSS(menuDom, {
      top: `${y}px`,
      left: `${x}px`,
      visibility: 'visible',
    });
    if (isString(menu)) {
      //the type is string
      menuDom.innerHTML = menu;
    } else if (menu instanceof HTMLElement) {
      //the type is html dom
      menuDom.innerHTML = menu.outerHTML;
    } else {
      //the type is Promise
      if (isString(this.options.loadingContent)) {
        menuDom.innerHTML = this.options.loadingContent;
      } else {
        menuDom.innerHTML = this.options.loadingContent.outerHTML;
      }
      if (e.itemId != this.currentTarget || !this.asyncMenu) {
        this.currentTarget = e.itemId;
        this.asyncMenu = await this.options.getContent(e);
      }
      if (e.itemId != this.currentTarget) {
        //The menu is not displayed, if `itemId` is unmatched.
        return;
      }
      if (isString(this.asyncMenu)) {
        menuDom.innerHTML = this.asyncMenu;
      } else {
        menuDom.innerHTML = this.asyncMenu.outerHTML;
      }
    }
    this.removeMenuEventListener();

    const handleMenuClick = this.options.handleMenuClick;
    if (handleMenuClick) {
      this.handleMenuClickWrapper = (event) => {
        handleMenuClick(event.target, e.itemId, graph);
      };
      menuDom.addEventListener('click', this.handleMenuClickWrapper);
    }

    let triggeredByFirstClick = this.options.trigger === 'click';
    const handler = (e) => {
      if (triggeredByFirstClick) {
        triggeredByFirstClick = false;
        return;
      }
      self.onMenuHide();
    };

    document.body.addEventListener('click', handler);
    this.handler = handler;
  }

  private removeMenuEventListener() {
    const handleMenuClickWrapper = this.handleMenuClickWrapper;
    const handler = this.handler;

    if (handleMenuClickWrapper) {
      const menuDom = this.menu;
      menuDom.removeEventListener('click', handleMenuClickWrapper);
      this.handleMenuClickWrapper = null;
    }
    if (handler) {
      document.body.removeEventListener('click', handler);
    }
  }

  private onMenuHide() {
    const menuDom = this.menu;
    if (menuDom) {
      modifyCSS(menuDom, { visibility: 'hidden' });
      this.removeMenuEventListener();
    }
  }

  public destroy() {
    const menu = this.menu;
    this.removeMenuEventListener();
    if (menu) {
      let container = this.options.container;
      if (!container) {
        container = this.graph.container as HTMLElement;
      }
      if (isString(container)) {
        container = document.getElementById(container) as HTMLElement;
      }
      container.removeChild(menu);
    }
  }
}
