//  Profound UI Runtime  -- A Javascript Framework for Rich Displays
//  Copyright (c) 2020 Profound Logic Software, Inc.
//
//  This file is part of the Profound UI Runtime
//
//  The Profound UI Runtime is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Lesser General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  The Profound UI Runtime is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Lesser General Public License for more details.
//
//  You should have received a copy of the GNU Lesser General Public License
//  In the COPYING and COPYING.LESSER files included with the Profound UI Runtime.
//  If not, see <http://www.gnu.org/licenses/>.


/**
 * Layout Class
 * @constructor
 */

pui.layout.Layout = function() {

  this.layoutDiv = null;
  this.designMode = false;
  this.template = "test";
  this.templateProps = {};
  this.lockedInPlace = false;
  this.stretchList = [];
  this.containers = [];
  this.centerHor = false;
  this.centerVert = false;
  
  //Function. Some child layouts have code that only works when the DOM element is visible and attached. For TabLayout and 
  //accordion, their child layouts' notifyvisibleOnce is called when section/tab changes. assigned in applyTemplate.js.
  this.notifyvisibleOnce = null;
  
  //When a lazy-loaded container is rendered, onlazyload script runs.
  this.onlazyload = null;
  //When a template implements lazy loading, this will be set to a function by applyTemplate.js.
  // Expect return type: Array of Numbers.
  this.getActiveContainerNumbers = null;
  
  // Lazy-loading
  this._renderParms = null;
  this._lazyChildren = {}; //Properties to render child items later. Keys: container numbers; values: arrays of properties objects.  
};
pui.layout.Layout.prototype = Object.create(pui.BaseClass.prototype);

/**
 * For each child in the specified container, stretch, sizeMe, and positionMe, if necessary.
 * @param {Object} container
 */
pui.layout.Layout.prototype._sizeContainer = function(container) {
  for (var j = 0; j < container.childNodes.length; j++) {
    var child = container.childNodes[j];
    if (child.layout != null) {
      child.layout.stretch();
      if (child.layout.iScroll != null) child.layout.iScroll["refresh"]();
    }
    if (child.sizeMe != null && typeof child.sizeMe == "function") {
      if (pui.isPercent(child.style.width) || pui.isPercent(child.style.height) || child.grid != null) {
        child.sizeMe();
      }
    }
    if (child.positionMe != null && typeof child.positionMe == "function")
      child.positionMe(); 
  }
};

/**
 * For each child in the specified container, notify that it is visible. This is necessary if certain code
 * in the child layout doesn't work until the layout is on the DOM and visible; e.g. tabLayout scroll buttons and date fields, charts in Chrome.
 * @param {Object} container
 */
pui.layout.Layout.prototype._notifyChildrenVisible =  function(container){
  for (var j = 0; j < container.childNodes.length; j++) {
    var child = container.childNodes[j];
    if (child.layout != null && typeof child.layout.notifyvisibleOnce == "function") {
      child.layout.notifyvisibleOnce();
      delete child.layout.notifyvisibleOnce; //Only need to notify once.
    }
    
    if (child.pui && typeof child.pui.notifyvisible == 'function'){
      child.pui.notifyvisible();  //A chart in Chrome may not render if the tab layout's tab is not selected--it is display:hidden. #6095
    }

    if (child.positionMe != null && typeof child.positionMe == "function"){
      child.positionMe();   //Make sure date_field calendar icons are positioned correctly.
    }
  }
};

/**
 * 
 */
pui.layout.Layout.prototype.enableDesign = function() {
  this.designMode = true;
  this.layoutDiv.destroy = this.destroy.bind(this);
  this.layoutDiv.addEventListener('click', this); 
};

/**
 * In Design mode, the user clicked the layout Div.
 * @param {MouseEvent} e
 */
pui.layout.Layout.prototype._designOnClick = function(e){
  if (this.lockedInPlace) {
    var target = getTarget(e);
    if (target == this.layoutDiv || (target.getAttribute != null && target.getAttribute("container") == "true")) {  // make sure we're not clicking on a widget inside the layout
      // select the layout
      var itm = this.designItem;
      if (itm == null) return;
      var selection = itm.designer.selection;
      if (selection.resizers.length == 1 && selection.resizers[0].designItem == itm) return;
      selection.clear();
      selection.add(itm);
      itm.designer.propWindow.refresh();
    }
  }
};

pui.layout.Layout.prototype.hasChildren = function() {
  var containers = pui.layout.template.getContainers(this.layoutDiv);
  for (var i = 0; i < containers.length; i++) {
    var container = containers[i];
    if (container.firstChild != null) return true;
  }
  return false;
};

/**
 * 
 * @param {Object} parms
 * @returns {Array}
 */
pui.layout.Layout.prototype.getChildren = function(parms) {
  if (parms == null) parms = {};
  parms.hasTabPanels = false;
  parms.hasFieldSets = false;
  var children = [];
  var designer = this.layoutDiv.designItem.designer;
  var items = designer.items;
  for (var i = 0; i < items.length; i++) {
    var itm = items[i];
    if (itm.getParentLayout() == this) {
      if (itm.properties["field type"] == "tab panel") parms.hasTabPanels = true;
      if (itm.properties["field type"] == "field set panel") parms.hasFieldSets = true;
      children.push(itm);
    }
  }
  return children;
};

pui.layout.Layout.prototype.setPropertiesModel = function() {
  this.layoutDiv.propertiesModel = pui.layout.getProperties(this.template);
  this.layoutDiv.propertiesNamedModel = makeNamedModel(this.layoutDiv.propertiesModel);
};

pui.layout.Layout.prototype.applyTemplate = function() {
  var parms = {
    dom: this.layoutDiv,
    template: this.template,
    properties: this.templateProps,
    designMode: this.designMode
  };
  var rv = pui.layout.template.applyTemplate(parms);
  if (rv.success) {
    this.stretchList = rv.stretchList;
    this.containers = rv.containers;
    this.stretch();
  }
  else {
    setTimeout(function() {
      pui.alert(rv.msg);
    }, 0);
    return rv;
  }
  this.setPropertiesModel();
  return rv;
};

/**
 * 
 * @param {String} propertyName
 * @param {String} value
 * @returns {Boolean}
 */
pui.layout.Layout.prototype.updatePropertyInDesigner = function(propertyName, value) {
  if (!this.designMode) return false;
  var itm = this.designItem;
  if (itm.properties[propertyName] != value) {
    if (pui.isBound(itm.properties[propertyName])) {
      itm.properties[propertyName].designValue = value;
    }
    else {
      itm.properties[propertyName] = value;
    }
    itm.propertiesChanged[propertyName] = true;
    itm.changed = true;
    itm.designer.changedScreens[itm.designer.currentScreen.screenId] = true;
    itm.designer.propWindow.refresh();
    return true;
  }
  return false;
};

/**
 * 
 */
pui.layout.Layout.prototype.stretch = function() {
  var dims = [];
  for (var i = 0; i < this.stretchList.length; i++) {
    var container = this.stretchList[i];
    container.style.width = "";
    container.style.height = "";
    //For Android, don't hide the container while it is resizing. Issue 2512.
    if(!pui["is_android"]) container.style.display = "none";
  }
  for (var i = 0; i < this.stretchList.length; i++) {
    var container = this.stretchList[i];
    var parent = container.parentNode;
    dims.push({
      width: parent.offsetWidth,
      height: parent.offsetHeight
    });
  }
  for (var i = 0; i < this.stretchList.length; i++) {
    var container = this.stretchList[i];
    var dim = dims[i];
    var overflowX = parent.style.overflowX;
    var overflowY = parent.style.overflowY;
    // In design mode, we accommodate to be able to show the layout border, etc. At runtime, the calculation is more exact.
    dim.width -= ((this.designMode && this.template !== 'mobile device' || overflowX === 'auto' || overflowX === 'scroll' || this.template == "table") ? 4 : 2);
    if (dim.width < 0) dim.width = 0;
    dim.height -= ((this.designMode && this.template !== 'mobile device' || overflowY === 'auto' || overflowY === 'scroll' || this.template == "table") ? 4 : 2);
    if (dim.height < 0) dim.height = 0;
    container.style.width = dim.width + "px";
    container.style.height = dim.height + "px";
    container.style.display = "";
  }
  this.sizeContainers();
  this.center();
};

/**
 * 
 */
pui.layout.Layout.prototype.sizeContainers = function() {
  for (var i = 0; i < this.containers.length; i++) {
    this._sizeContainer(this.containers[i]);
  }
};

/**
 * For all visible containers in layouts that hide containers, notify children of those containers that they are visible.
 * @returns {undefined}
 */
pui.layout.Layout.prototype.notifyContainersVisible = function(){
  if (typeof this.getActiveContainerNumbers == "function"){
    var containerNums = this.getActiveContainerNumbers();
    for (var i = 0; i < containerNums.length; i++) {
      if (containerNums[i] >= 0 && this.containers.length > containerNums[i]){
        var container = this.containers[ containerNums[i] ];
        this._notifyChildrenVisible(container);
      }
    }
  }
};

/**
 * 
 */
pui.layout.Layout.prototype.center = function() {
  var hor = this.centerHor;
  var vert = this.centerVert;

  // Trigger centering logic in design mode
  if (this.designMode && this.designItem) {
    var item = this.designItem;
    var centerHorizontally = null;
    if (item.propertiesChanged["center horizontally"]) centerHorizontally = item.properties["center horizontally"];
    if (centerHorizontally === "true") {
      var halfWidth = parseInt(this.layoutDiv.offsetWidth / 2);
      if (!isNaN(halfWidth) && halfWidth > 0) {
        this.layoutDiv.style.left = "calc(50% - " + halfWidth + "px)";
        var resizer = item.getResizer();
        if (resizer) resizer.positionSizies();
      }
    }
  }

  // Runtime processing
  if (!hor && !vert) return;

  var size = {};
  var parentIsBrowserWindow = false;
  var parent = this.layoutDiv.parentNode;
  if ( parent != null && parent.tagName == "DIV" &&
       parent.offsetWidth > 0 &&
       (parent.parentNode != document.body || (parent.style.width != null && parent.style.height != null && parent.style.width != "" && parent.style.height != "")) ) {
    size.width = parent.offsetWidth;
    size.height = parent.offsetHeight;
  }
  else {
    var windowSize = pui["getWindowSize"]();
    size.width = windowSize["width"];
    size.height = windowSize["height"];
    parentIsBrowserWindow = true;
  }

  if (hor) {
    var layoutLeft = parseInt((size.width - this.layoutDiv.offsetWidth) / 2);
    if (layoutLeft < 0) {
      if (parentIsBrowserWindow) document.body.scrollLeft = Math.abs(layoutLeft);
      layoutLeft = 0;
    }
    this.layoutDiv.style.left = layoutLeft + "px";
  }

  if (vert) {
    var layoutTop = parseInt((size.height - this.layoutDiv.offsetHeight) / 2);
    if (layoutTop < 0) {
      layoutTop = 0;
    }    
    this.layoutDiv.style.top = layoutTop + "px";
  }
};

/**
 * 
 */
pui.layout.Layout.prototype.resize = function() {
  var panel = this.layoutDiv.panel;
  var accordion = this.layoutDiv.accordion;
  var responsivelayout = this.layoutDiv.responsivelayout;
  var tabLayout = this.layoutDiv.tabLayout;
  if (panel) panel.resize();
  if (accordion) accordion.resize();
  if (responsivelayout) responsivelayout.resize();
  if (tabLayout) tabLayout.resize();
};

/**
 * 
 * @param {String} property
 * @param {String} value
 */
pui.layout.Layout.prototype.setProperty = function(property, value) {
  if (value == null) value = "";
  var panel = this.layoutDiv.panel;
  var accordion = this.layoutDiv.accordion;
  var responsivelayout = this.layoutDiv.responsivelayout;
  var tabLayout = this.layoutDiv.tabLayout;

  switch (property) {
    case "id":
      this.layoutDiv.id = value;
      if (responsivelayout != null){
        //The responsive layout's embedded styles can use the widget's ID. So these must be refreshed.
        responsivelayout.setRules();
      }
      break;

    case "field type":
      break;

    case "template":
      if (this.designMode) {
        this.designItem.properties["template"] = value;
        this.designItem.propertiesChanged["template"] = true;
        this.designItem.changed = true;
        this.designItem.designer.changedScreens[this.designItem.designer.currentScreen.screenId] = true;
        this.designItem.designer.propWindow.refresh();
        if (panel) panel.resize();
        if (accordion) accordion.resize();
        if (responsivelayout) responsivelayout.resize();
        if (tabLayout) tabLayout.resize();
      }
      break;

    case "left":
    case "top":
    case "right":
    case "bottom":
      this.layoutDiv.style[property] = value;
      break;

    case "height":
    case "width":
    case "min height":
    case "min width":
    case "max height":
    case "max width":
      var words = property.split(" ");
      var styleName = property;
      if (words.length > 1) {
        styleName = words[0] + words[1].substr(0, 1).toUpperCase() + words[1].substr(1);
      }
      this.layoutDiv.style[styleName] = value;
      if (panel != null) panel.resize();
      if (accordion != null) accordion.resize();
      if (responsivelayout != null) responsivelayout.resize();
      if (tabLayout != null) tabLayout.resize();
      this.stretch();

      // To allow inline-style setting and removing, cache the style property.
      if (this.designMode) {
        if( value.length == 0 )
          pui.removeCachedStyle(this.layoutDiv, styleName);
        else
          pui.cacheStyle(this.layoutDiv, styleName, value );
      }
      break;

    case "z index":
      this.layoutDiv.style.zIndex = value;

      // To allow inline-style setting and removing, cache the style property.
      if (this.designMode) {
        if( value.length == 0 )
          pui.removeCachedStyle(this.layoutDiv, "z-index");
        else
          pui.cacheStyle(this.layoutDiv, "z-index", value );
      }
      break;

    case "center horizontally":
      if (!this.designMode) this.centerHor = (value == "true" || value == true);
      break;

    case "center vertically":
      if (!this.designMode) this.centerVert = (value == "true" || value == true);
      break;

    case "locked in place":
      this.lockedInPlace = (value == "true" || value == true);
      break;

    case "css class":
      break;

    case "overflow x":
      this.layoutDiv.firstChild.style.overflowX = value;
      break;

    case "tool tip":
      this.layoutDiv.title = value;
      break;

    case "visibility":
      if (!this.designMode) {
        this.layoutDiv.style.visibility = value;
      }
      if (this.designMode) {
        if (value == "hidden") {
          this.layoutDiv.style.filter = "alpha(opacity=30)";
          this.layoutDiv.style.opacity = 0.30;
        }
        else {
          this.layoutDiv.style.filter = "";
          this.layoutDiv.style.opacity = "";
        }
      }
      break;

    case "onclick":
    case "ondblclick":
    case "onmousedown":
    case "onmousemove":
    case "onmouseout":
    case "onmouseover":
    case "onmouseup":
      // Note: this function seems to be overwritten in runtime by code in applyPropertyToField in runtime/properties.js around line 1898.
      if (!this.designMode) {
        var me = this;
        var func = function(e) {
          try {
            var customFunction = eval(value);
            if (typeof customFunction == "function") {
              customFunction(e, me);
            }
          }
          catch(err) {
            pui.scriptError(err, property.substr(0,1).toUpperCase() + property.substr(1) + " Error:\n");        
          }
        };
        this.layoutDiv[property] = func;
      }
      break;

    case "has header":
      if (panel != null) panel.setHasHeader(value != "false" && value != false);
      this.templateProps[property] = value;
      break;

    case "small sections":
      if (accordion != null) accordion.setMini(value == "true" || value == true);
      this.templateProps[property] = value;
      break;

    case "allow collapse":
      if (accordion != null) accordion.setAllowCollapse(value);
      this.templateProps[property] = value;
      break;

    case "header height":
      if (panel != null) panel.setHeaderHeight(value);
      this.templateProps[property] = value;
      break;

    case "header text":
      if (panel != null) panel.setText(value);
      this.templateProps[property] = value;
      break;

    case "header theme":
      if (panel != null) panel.setHeaderSwatch(value);
      if (accordion != null) accordion.setHeaderSwatch(value);
      this.templateProps[property] = value;
      break;

    case "body theme":
      if (panel != null) panel.setBodySwatch(value);
      if (accordion != null) accordion.setBodySwatch(value);
      this.templateProps[property] = value;
      break;

    case "straight edge":
      if (panel != null) panel.setStraightEdge(value);
      if (accordion != null) accordion.setStraightEdge(value);
      this.templateProps[property] = value;
      break;

    case "color":
    case "font family":
    case "font size":
    case "font style":
    case "font weight":
    case "text align":
    case "text decoration":
    case "text transform":
      if (panel != null) panel.setStyle(property, value);
      if (accordion != null) {
        accordion.setStyle(property, value);
        if (property == "font family" || property == "font size") {
          accordion.resize();
        }
      }
      if (tabLayout != null) {
        tabLayout.setStyle(property, value);
      }
      this.templateProps[property] = value;
      break;

    case "onsectionclick":
      if (!this.designMode) {
         this.layoutDiv[property + "event"] = function() {
          eval("var section = arguments[0];");
          try {
            return eval(value);
          }
          catch(err) {
            pui.scriptError(err, "Onexpand Error:\n");
          }
        };
      }
      break;

    case "onlazyload":
      if (!this.designMode && typeof value == "string" && value.length > 0){
        this.onlazyload = value;
      }
      break;

    default: 
      var savedValue = this.templateProps[property];
      this.templateProps[property] = value;
      if (this.designMode && !toolbar.loadingDisplay && !toolbar.pastingFormat) {
        var rv = this.applyTemplate();
        if (this.layoutDiv.accordion != null) this.layoutDiv.accordion.resize();
        if (rv.success == false) {
          this.templateProps[property] = savedValue;
          var me = this;
          setTimeout(function() {
            me.updatePropertyInDesigner(property, savedValue);
          }, 0);
        }
      }
      break;  
  }
};

pui.layout.Layout.prototype.applyScrolling = function() {
  // Note: the closured, "me", saves us from reworking the functions below while allowing applyScrolling to be in the prototype.
  var me = this;
  function setupiScroll() {
    var parent = me.layoutDiv.parentNode;
    if (parent != null && parent.tagName == "DIV") {
      if (pui["is_ios"]) {

        document.body.addEventListener('tap', function (e) {
          e["preventDefault"]();
          e["stopPropagation"]();
          e["stopImmediatePropagation"]();
          var event = new MouseEvent('click',{
            view: window,
            bubbles: true,
            cancelable: true
          });
          var target = getTarget(e);
          if (target) {
            if (!/^(INPUT|TEXTAREA|BUTTON|SELECT|IMG)$/.test(target.tagName)) {

              // Avoid firing onclick more than once per tap, as happens in 'scroller' classes. If last handled click was > 2 seconds ago, just fire. #5169.
              if (pui.iscrolltapped == null || (new Date() - pui.iscrolltapped) > 2000 ){
                setTimeout(function() {
                  var isCanceled = target.dispatchEvent(event);
                  if (!isCanceled) {
                    event["preventDefault"]();
                    event["stopPropagation"]();
                  }
                },10);
              }
              pui.iscrolltapped = new Date();  //Prevent next click; this will be cleared in 'onclick' in properties.js.
            }
          } 
        }, false);
      }
      var config = {
        "scrollbars": true,
        "mouseWheel": true,
        "shrink": true,
        "tap": pui["is_ios"],
        "disableMouse": pui["is_ios"],
        "preventDefaultException": {
          tagName: /^(INPUT|TEXTAREA|BUTTON|SELECT|IMG)$/
        },
        "onBeforeScrollStart": function (e) {
          var target = getTarget(e);
          while (target.nodeType != 1) target = target.parentNode;
          while (target.tagName == "SPAN") target = target.parentNode;
          if (target.tagName != "SELECT" && target.tagName != "INPUT" && target.tagName != "TEXTAREA" && target.tagName != "A") {
            e.preventDefault();
          }
        }
      };
      if (typeof IScroll == "function") me.iScroll = new IScroll(parent, config);  // new version
      else me.iScroll = new iScroll(parent, config);  // old version
    }
  }

  var counter = 0;

  function keepTryingToSetupiScroll() {
    counter++;
    if (counter > 100) {  // give up
      return;
    }
    setTimeout(function() {
      if (typeof IScroll == "function" || typeof iScroll == "function") {  // as of version 5, the class name is IScroll (used to be iScroll)
        setupiScroll();
      }
      else {
        keepTryingToSetupiScroll();
      }        
    }, 200);
  }

  if (typeof IScroll == "function" || typeof iScroll == "function") {  // as of version 5, the class name is IScroll (used to be iScroll)
    setupiScroll();
  }
  else {
    var returnValue = pui["loadJS"]({
      "path": pui.normalizeURL("/iscroll/iscroll.js"),
      "callback": function() {
        setupiScroll();
      }
    });
    if (returnValue == false) {
      keepTryingToSetupiScroll();
    }
  }      
};

/**
 * 
 */
pui.layout.Layout.prototype._onresize = function(){
  if (this.assignHeightOnResize == true) {
    var height = document.documentElement.clientHeight + "px";  // clientHeight is always the currently-vertical height, minus window chrome
    this.layoutDiv.parentNode.style.height = height;
    document.body.style.height = height;
    document.body.parentNode.style.height = height;
    this.layoutDiv.style.height = height;
    this.setProperty("height", height);
  }
  this.stretch();
};


/**
 * Save data from pui.renderFormat to allow lazy loading widgets inside a layout.
 * Properties set here should not be ones set by grids. (rowNum, subfileRow, dataArrayIndex, highlighting)
 *   me.renderItems sets some others.
 *   onload should not be set, because it only fires for the main format.
 * @param {Object} parms
 * @returns {undefined}
 */
pui.layout.Layout.prototype.saveFormat = function(parms){
  this._renderParms = {
    active: parms.active,
    data: parms.data,
    designMode: parms.designMode,
    "errors": parms["errors"],
    "file": parms["file"],
    "fileId": parms["fileId"],
    lastFormat: parms.lastFormat,
    lastLayer: parms.lastLayer,
    "library": parms["library"],
    metaData: {
      screen: {
        "record format name": parms.metaData.screen["record format name"]
      }
    },
    "msgInfo": parms["msgInfo"],
    name: parms.name,
    ref: parms.ref,
    runOnload: parms.runOnload,
    subfiles: parms.subfiles
  };
};

/**
 * Store an item's properties so it can be rendered later. (Called by pui.renderFormat.) Makes a copy of the properties
 * and removes the .layout reference. Stores the item in a collection keyed to the specified container.
 * @param {Number} container  The layout's container number in which the item belongs. Zero-based index.
 * @param {Object} item       The rendering properties.
 * @returns {undefined}
 */
pui.layout.Layout.prototype.deferLazyChild = function(container, item){
  if (this._lazyChildren[container] == null){
    this._lazyChildren[container] = [];
  }
  var myid = this.layoutDiv.id;
  var itemCopy = {};
  // Copy item properties except references to the layout.
  for (var key in item){
    // If item is in this layout, then omit item's container and layout properties.
    //   (because item's container will be one in this layout)
    // If item is not in this layout, then include container and layout properties.
    //   (because it will be inside a grid or another layout that's inside this one.)
    if (item["layout"] != myid || (key != "container" && key != "layout" ) ){
      if (typeof item[key] == "object" && item[key] != null){
        try {
          itemCopy[key] = JSON.parse( JSON.stringify(item[key]) ); //Bound properties are objects.
        } catch(exc){}
      }else{
        itemCopy[key] = item[key];
      }
    }
  }
  this._lazyChildren[container].push(itemCopy);
};

/**
 * Render items for the currently visible containers if the items haven't already been rendered.
 * Called by layout template classes when visible container changes and once in pui.renderFormat (rendering the main format).
 * @param {Array|undefined} containerNums    List of indices of containers. When undefined, getActiveContainerNumbers will be called.
 * @returns {undefined}
 */
pui.layout.Layout.prototype.renderItems = function( containerNums ){
  //All items have been rendered, or lazy load wasn't implemented for the layout, or saveFormat wasn't called yet.
  if (this._renderParms == null) return;

  if ((containerNums == null || containerNums.length < 1 )){
    // The parameter didn't provide container numbers, so fetch from the layout template's class.
    if (typeof this.getActiveContainerNumbers == "function"){
      containerNums = this.getActiveContainerNumbers();
    }else{
      return; //Do nothing.
    }
  }

  // Look at each container specified by the layout template's class. (Usually only one is specified.)
  for (var i=0; i < containerNums.length; i++){
    var cnum = containerNums[i];

    if (this._lazyChildren[cnum] != null && this.containers[cnum] != null){
      this._renderParms.container = this.containers[cnum];
      this._renderParms.lazyContainerNum = cnum;
      this._renderParms.metaData.items = this._lazyChildren[cnum];
      this._renderParms.onlazyload = this.onlazyload;
      pui.renderFormat(this._renderParms);
      delete this._lazyChildren[cnum]; //Prevents rendering same items again after they're already rendered.
    }
  }
  // Free up format data from this widget once all items are rendered. Data could be large.
  if (Object.keys(this._lazyChildren).length == 0){
    this._renderParms = null;
  }
};

/**
 * Called by pui.cleanup. Dereference variables.
 */
pui.layout.Layout.prototype.destroy = function() {
  window.removeEventListener('resize', this);
  if (this.iScroll != null) {
    this.iScroll["destroy"]();
  }
  this.deleteOwnProperties();
};


/**
 * Event handler for any events assigned to "this".
 * @param {Event} e
 */
pui.layout.Layout.prototype['handleEvent'] = function(e) {
  switch (e.type){
    case 'resize': this._onresize(e); break;
    case 'click': this._designOnClick(e); break;
  }
};