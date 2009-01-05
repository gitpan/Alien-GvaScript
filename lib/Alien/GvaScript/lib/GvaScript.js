/*-------------------------------------------------------------------------*
 * GvaScript - Javascript framework born in Geneva.
 *
 *  Authors: Laurent Dami            <laurent.d...@etat.ge.ch>
 *           Jean-Christophe Durand  <jean-christophe.d.....@etat.ge.ch>
 *           Sébastien Cuendet       <sebastien.c.....@etat.ge.ch>
 *  LICENSE
 *  This library is free software, you can redistribute it and/or modify
 *  it under the same terms as Perl's artistic license.
 *
 *--------------------------------------------------------------------------*/

var GvaScript = {
  Version: '1.11'
}

//----------protoExtensions.js
//-----------------------------------------------------
// Some extensions to the prototype javascript framework
//-----------------------------------------------------
if (!window.Prototype)
  throw  new Error("Prototype library is not loaded");

Object.extend(Element, {

  classRegExp : function(wanted_classes) {
    if (typeof wanted_classes != "string" &&
        wanted_classes instanceof Array)
       wanted_classes = wanted_classes.join("|");
    return new RegExp("\\b(" + wanted_classes + ")\\b");
  },

  hasAnyClass: function (elem, wanted_classes) {
    return Element.classRegExp(wanted_classes).test(elem.className);
  },

  getElementsByClassNames: function(parent, wanted_classes) {
    var regexp = Element.classRegExp(wanted_classes);
    var children = ($(parent) || document.body).getElementsByTagName('*');
    var result = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (regexp.test(child.className)) result.push(child);
    }
    return result;
  },

  // start at elem, walk nav_property until find any of wanted_classes
  navigateDom: function (elem, navigation_property, 
                         wanted_classes, stop_condition) {
    while (elem){
       if (stop_condition && stop_condition(elem)) break;
       if (elem.nodeType == 1 &&
           Element.hasAnyClass(elem, wanted_classes))
         return elem;
       // else walk to next element
       elem = elem[navigation_property];
     }
     return null;
  },


  autoScroll: function(elem, container, percentage) {
     percentage = percentage || 20; // default                  
     var parent = elem.offsetParent;
     var offset = elem.offsetTop;

     // offset calculations are buggy in Gecko, so we need a hack here
     if (/Gecko/.test(navigator.userAgent)) { 
       parent = elem.parentNode;
       while (parent) {
         var overflowY;
         try      {overflowY = Element.getStyle(parent, "overflowY")}
         catch(e) {overflowY = "visible";}
         if (overflowY != "visible") break; // found candidate for offsetParent
         parent = parent.parentNode;
       }
       parent  = parent || document.body;
       
       //offset -= parent.offsetTop
       // commented out Jean-Christophe 18.4.07 
       // solves a bug with autoCompleters, but new bug with choiceList ..
       // .. TODO: need to investigate further how firefox handles offsets.
     }

     container = container || parent;

     var min = offset - (container.clientHeight * (100-percentage)/100);
     var max = offset - (container.clientHeight * percentage/100);
     if      (container.scrollTop < min) container.scrollTop = min;
     else if (container.scrollTop > max) container.scrollTop = max;
  },

  outerHTML: function(elem) {
    var tag = elem.tagName;
    if (!tag)
      return elem;           // not an element node
    if (elem.outerHTML)
      return elem.outerHTML; // has builtin implementation 
    else {
      var attrs = elem.attributes;
      var str = "<" + tag;
      for (var i = 0; i < attrs.length; i++) {
        var val = attrs[i].value;
        var delim = val.indexOf('"') > -1 ? "'" : '"';
        str += " " + attrs[i].name + "=" + delim + val + delim;
      }
      return str + ">" + elem.innerHTML + "</" + tag + ">";
    }
  }

});

Class.checkOptions = function(defaultOptions, ctorOptions) {
  ctorOptions = ctorOptions || {}; // options passed to the class constructor
  for (var property in ctorOptions) {
    if (defaultOptions[property] === undefined)
      throw new Error("unexpected option: " + property);
  }
  return Object.extend(Object.clone(defaultOptions), ctorOptions);
};
  

Object.extend(Event, {

  detailedStop: function(event, toStop) {
    if (toStop.preventDefault) { 
      if (event.preventDefault) event.preventDefault(); 
      else                      event.returnValue = false;
    }
    if (toStop.stopPropagation) { 
      if (event.stopPropagation) event.stopPropagation(); 
      else                       event.cancelBubble = true;
    }
  },

  stopAll:  {stopPropagation: true, preventDefault: true},
  stopNone: {stopPropagation: false, preventDefault: false}

});


function ASSERT (cond, msg) {
  if (!cond) 
    throw new Error("Violated assertion: " + msg);
}


//----------event.js
// fireEvent : should be COPIED into controller objects, so that 
// 'this' is properly bound to the controller

GvaScript.fireEvent = function(/* type, elem1, elem2, ... */) {

  var event;

  switch (typeof arguments[0]) {
  case "string" : 
    event = {type: arguments[0]}; 
    break;
  case "object" :
    event = arguments[0];
    break;
  default:
    throw new Error("invalid first argument to fireEvent()");
  }
  
  var propName = "on" + event.type;
  var handler;
  var target   = arguments[1]; // first element where the event is triggered
  var currentTarget;           // where the handler is found


  // try to find the handler, first in the HTML elements, then in "this"
  for (var i = 1, len = arguments.length; i < len; i++) {
    var elem = arguments[i];
    if (handler = elem.getAttribute(propName)) {
      currentTarget = elem;
      break;
    }
  }
  if (currentTarget === undefined)
    if (handler = this[propName])
      currentTarget = this;

  if (handler) {
    // build context 
    var controller = this;
    event.target = event.srcElement = target;
    event.currentTarget = currentTarget;
    event.controller    = controller;

    if (typeof(handler) == "string") {
      // string will be eval-ed in a closure context where 'this', 'event',
      // 'target' and 'controller' are defined.
      var eval_handler = function(){return eval( handler ) };
      handler = eval_handler.call(currentTarget); // target bound to 'this'
    }

    if (handler instanceof Function) {
      // now call the eval-ed or pre-bound handler
      return handler(event);
    }
    else 
      return handler; // whatever was returned by the string evaluation
  }
  else
    return null; // no handler found
};


//----------keyMap.js

//constructor
GvaScript.KeyMap = function (rules) {
    if (!(rules instanceof Object)) throw "KeyMap: invalid argument";
    this.rules = [rules];
    return this;
};
  

GvaScript.KeyMap.prototype = {
    
  eventHandler: function (options) {

    var keymap = this;

    var defaultOptions = Event.stopAll;
    options = Class.checkOptions(defaultOptions, options || {});

    return function (event) {
      event = event || window.event;

      // translate key code into key name
      event.keyName = keymap._builtinName[event.keyCode] 
	           || String.fromCharCode(event.keyCode);

      // add Control|Shift|Alt modifiers
      event.keyModifiers = "";
      if (event.ctrlKey  && !options.ignoreCtrl)  event.keyModifiers += "C_";
      if (event.shiftKey && !options.ignoreShift) event.keyModifiers += "S_";
      if (event.altKey   && !options.ignoreAlt)   event.keyModifiers += "A_";

      // but cancel all modifiers if main key is Control|Shift|Alt
      if (event.keyName.search(/^(CTRL|SHIFT|ALT)$/) == 0) 
	event.keyModifiers = "";

      // try to get the corresponding handler, and call it if found
      var handler = keymap._findInStack(event, keymap.rules);
      if (handler) {
        var toStop = handler.call(keymap, event);
        Event.detailedStop(event, toStop || options);
      }
    };
  },

  observe: function(eventType, elem, options) {
    eventType = eventType || 'keydown';
    elem      = elem      || document;

    // "Shift" modifier usually does not make sense for keypress events
    if (eventType == 'keypress' && !options) 
      options = {ignoreShift: true};

    Event.observe(elem, eventType, this.eventHandler(options));
  },


  _findInStack: function(event, stack) {
    for (var i = stack.length - 1; i >= 0; i--) {
      var rules = stack[i];

      // trick to differentiate between C_9 (digit) and C_09 (TAB)
      var keyCode = event.keyCode>9 ? event.keyCode : ("0"+event.keyCode);

      var handler = rules[event.keyModifiers + event.keyName]
                 || rules[event.keyModifiers + keyCode]
                 || this._regex_handler(event, rules.REGEX, true)
                 || this._regex_handler(event, rules.ANTIREGEX, false);
      if (handler) 
        return handler;
    }
    return null;
  },

  _regex_handler: function(event, regex_rules, want_match) {
    if (!regex_rules) return null;
    for (var j = 0; j < regex_rules.length; j++) {
      var rule      = regex_rules[j];
      var modifiers = rule[0];
      var regex     = rule[1];
      var handler   = rule[2];

      var same_modifiers = modifiers == null 
                        || modifiers == event.keyModifiers;

      // build regex if it was passed as a string
      if (typeof(regex) == "string") 
        regex = new RegExp("^(" + regex + ")$");

      var match = same_modifiers && regex.test(event.keyName);
      if ((match && want_match) || (!match && !want_match)) 
        return handler;
    }
    return null;
  },

  _builtinName: {
      8: "BACKSPACE",
      9: "TAB",
     10: "LINEFEED",
     13: "RETURN",
     16: "SHIFT",
     17: "CTRL",
     18: "ALT",
     19: "PAUSE",
     20: "CAPS_LOCK",
     27: "ESCAPE",
     32: "SPACE",
     33: "PAGE_UP",
     34: "PAGE_DOWN",
     35: "END",
     36: "HOME",
     37: "LEFT",
     38: "UP",
     39: "RIGHT",
     40: "DOWN",
     44: "PRINT_SCREEN", // MSIE6.0: will only fire on keyup!
     45: "INSERT",
     46: "DELETE",
     91: "WINDOWS",
     96: "KP_0",
     97: "KP_1",
     98: "KP_2",
     99: "KP_3",
    100: "KP_4",
    101: "KP_5",
    102: "KP_6",
    103: "KP_7",
    104: "KP_8",
    105: "KP_9",
    106: "KP_STAR",
    107: "KP_PLUS",
    109: "KP_MINUS",
    110: "KP_DOT",
    111: "KP_SLASH",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NUM_LOCK",
    145: "SCROLL_LOCK"
  }
};

GvaScript.KeyMap.MapAllKeys = function(handler) {
    return {REGEX:[[null, /.*/, handler]]}
};


GvaScript.KeyMap.Prefix = function(rules) {

    // create a specific handler for the next character ...
    var one_time_handler = function (event) {
        this.rules.pop(); // cancel prefix
        var handler = this._findInStack(event, [rules]);
        if (handler) handler.call(this, event);
    }

    // ... and push that handler on top of the current rules
    return function(event) {
        this.rules.push(GvaScript.KeyMap.MapAllKeys(one_time_handler));
    }
};


//----------treeNavigator.js
//-----------------------------------------------------
// Constructor
//-----------------------------------------------------

GvaScript.TreeNavigator = function(elem, options) {

  // fix bug of background images on dynamic divs in MSIE 6.0, see URLs
  // http://www.bazon.net/mishoo/articles.epl?art_id=958
  // http://misterpixel.blogspot.com/2006/09/forensic-analysis-of-ie6.html
  try { document.execCommand("BackgroundImageCache",false,true); }
  catch(e) {}; 


  elem = $(elem); // in case we got an id instead of an element
  options = options || {};

  // default options
  var defaultOptions = {
    tabIndex            : -1,
    treeTabIndex        :  0,
    flashDuration       : 200,     // milliseconds
    flashColor          : "red",
    selectDelay         : 100,     // milliseconds
    selectOnButtonClick : false,
    noPingOnFirstClick  : false,
    selectFirstNode     : true,
    createButtons       : true,
    autoScrollPercentage: 20,
    classes             : {},
    keymap              : null
  };

  this.options = Class.checkOptions(defaultOptions, options);

  // values can be single class names or arrays of class names
  var defaultClasses = {
    node     : "TN_node",
    leaf     : "TN_leaf",
    label    : "TN_label",
    closed   : "TN_closed",
    content  : "TN_content",
    selected : "TN_selected",
    mouse    : "TN_mouse",
    button   : "TN_button",
    showall  : "TN_showall"
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);
  this.classes.nodeOrLeaf = [this.classes.node, this.classes.leaf].flatten();

  // connect to the root element
  this.rootElement = elem;
  this.initSubTree(elem);

  // initializing the keymap
  var keyHandlers = {
    DOWN:       this._downHandler   .bindAsEventListener(this),
    UP:         this._upHandler     .bindAsEventListener(this),
    LEFT:       this._leftHandler   .bindAsEventListener(this),
    RIGHT:      this._rightHandler  .bindAsEventListener(this),
    KP_PLUS:    this._kpPlusHandler .bindAsEventListener(this),
    KP_MINUS:   this._kpMinusHandler.bindAsEventListener(this),
    KP_STAR:    this._kpStarHandler .bindAsEventListener(this),
    KP_SLASH:   this._kpSlashHandler.bindAsEventListener(this),
    C_R:        this._ctrl_R_handler.bindAsEventListener(this),
    RETURN:     this._ReturnHandler .bindAsEventListener(this),
    C_KP_STAR:  this._showAll       .bindAsEventListener(this, true),
    C_KP_SLASH: this._showAll       .bindAsEventListener(this, false),
    HOME:       this._homeHandler   .bindAsEventListener(this),
    END:        this._endHandler    .bindAsEventListener(this),

    C_PAGE_UP  : this._ctrlPgUpHandler  .bindAsEventListener(this),
    C_PAGE_DOWN: this._ctrlPgDownHandler.bindAsEventListener(this),


    // to think : do these handlers really belong to Tree.Navigator?
    PAGE_DOWN:function(event){window.scrollBy(0, document.body.clientHeight/2);
                              Event.stop(event)},
    PAGE_UP:  function(event){window.scrollBy(0, - document.body.clientHeight/2);
                              Event.stop(event)}
  };
  if (this.options.tabIndex >= 0)
    keyHandlers["TAB"] = this._tabHandler.bindAsEventListener(this);

  // handlers for ctrl_1, ctrl_2, etc. to open the tree at that level
  var numHandler = this._chooseLevel.bindAsEventListener(this);
  $R(1, 9).each(function(num){keyHandlers["C_" + num] = numHandler});

  // tabIndex for the tree element
  elem.tabIndex = elem.tabIndex || this.options.treeTabIndex;

  if (options.keymap) {
    this.keymap = options.keymap;
    this.keymap.rules.push(keyHandlers);
  }
  else {
    this.keymap = new GvaScript.KeyMap(keyHandlers);

    // observe keyboard events on tree (preferred) or on document
    var target = (elem.tabIndex  < 0) ? document : elem;
    this.keymap.observe("keydown", target, Event.stopNone);
  }

  // selecting the first node
  if (this.options.selectFirstNode) {
    this.select(this.firstSubNode());

    // if labels do not take focus but tree does, then set focus on the tree
    if (this.options.tabIndex < 0 && elem.tabIndex >= 0)
      elem.focus();
  }
}


GvaScript.TreeNavigator.prototype = {

//-----------------------------------------------------
// Public methods
//-----------------------------------------------------


  initSubTree: function (elem) {
    var labels = Element.getElementsByClassNames(elem, this.classes.label);
    this._addButtonsAndHandlers(labels); 
    this._addTabbingBehaviour(labels);
  },

  isClosed: function (node) {
    return Element.hasAnyClass(node, this.classes.closed); 
  },

  isVisible: function(elem) { // true if elem is not display:none
    return elem.offsetTop > -1;
  },

  isLeaf: function(node) {
    return Element.hasAnyClass(node, this.classes.leaf);
  },

  isRootElement: function(elem) {
    return (elem === this.rootElement);
  },


  close: function (node) {
    if (this.isLeaf(node))
      return;
    Element.addClassName(node, this.classes.closed);             
    this.fireEvent("Close", node, this.rootElement);

    // if "selectedNode" is no longer visible, select argument node as current
    var selectedNode = this.selectedNode;
    var walkNode = selectedNode;
    while (walkNode && walkNode !== node) {
      walkNode = this.parentNode(walkNode);
    }
    if (walkNode && selectedNode !== node) 
      this.select(node);
  },

  open: function (node) {
    if (this.isLeaf(node))
      return;

    Element.removeClassName(node, this.classes.closed);
    this.fireEvent("Open", node, this.rootElement);
    if (!this.content(node))
      this.loadContent(node);
  },

  toggle: function(node) {
    if (this.isClosed(node))
        this.open(node);
    else
        this.close(node);
  },

  openEnclosingNodes: function (elem) {
    var node = this.enclosingNode(elem);
    while (node) {
      if (this.isClosed(node))
        this.open(node);
      node = this.parentNode(node);
    }
  },

  openAtLevel: function(elem, level) {
    var method = this[(level > 1) ? "open" : "close"];
    var node = this.firstSubNode(elem);
    while (node) {
      method.call(this, node); // open or close
      this.openAtLevel(node, level-1);
      node = this.nextSibling(node);
    }
  },

  loadContent: function (node) {
    var url = node.getAttribute('tn:contenturl');
    // TODO : default URL generator at the tree level

    if (url) {
      var content = this.content(node);
      if (!content) {
        content = document.createElement('div');
        content.className = this.classes.content;
        var content_type = node.getAttribute('content_type');
        if (content_type) content.className += " " + content_type;
        content.innerHTML = "loading " + url;
        node.insertBefore(content, null); // null ==> insert at end of node
      }
      this.fireEvent("BeforeLoadContent", node, this.rootElement);

      var treeNavigator = this; // needed for closure below
      var callback = function() {
        treeNavigator.initSubTree(content);
        treeNavigator.fireEvent("AfterLoadContent", node, this.rootElement);
      };
      new Ajax.Updater(content, url, {onComplete: callback});
      return true;
    }
  },

  select: function (node) {
    var previousNode = this.selectedNode;

    // re-selecting the current node is a no-op
    if (node == previousNode) return;

    // deselect the previously selected node
    if (previousNode) {
        var label = this.label(previousNode);
        if (label) Element.removeClassName(label, this.classes.selected);
    }


    // select the new node
    var now = (new Date()).getTime(); 
    if (node)
        this._lastSelectTime = now;
    this.selectedNode = node;
    if (node) {
      this._assertNodeOrLeaf(node, 'select node');
      var label = this.label(node);
      if (!label) {
        throw new Error("selected node has no label");
      }
      else {
        Element.addClassName(label, this.classes.selected);

        if (this.isVisible(label)) {
          if (this.options.autoScrollPercentage !== null)
            Element.autoScroll(label, 
                               this.rootElement, 
                               this.options.autoScrollPercentage);
        }
      }
    }

    // register code to call the selection handlers after some delay
    if (! this._selectionTimeoutId) {
      var callback = this._selectionTimeoutHandler.bind(this, previousNode);
      this._selectionTimeoutId = 
        setTimeout(callback, this.options.selectDelay);
    }
  },


  label: function(node) {
    this._assertNodeOrLeaf(node, 'label: arg type');
    return Element.navigateDom(node.firstChild, 'nextSibling',
                               this.classes.label);
  },

  content: function(node) {
    if (this.isLeaf(node)) return null;
    this._assertNode(node, 'content: arg type');
    return Element.navigateDom(node.lastChild, 'previousSibling',
                               this.classes.content);
  },

  parentNode: function (node) {
    this._assertNodeOrLeaf(node, 'parentNode: arg type');
    return Element.navigateDom(
      node.parentNode, 'parentNode', this.classes.node, 
      this.isRootElement.bind(this));
  },

  nextSibling: function (node) {
    this._assertNodeOrLeaf(node, 'nextSibling: arg type');
    return Element.navigateDom(node.nextSibling, 'nextSibling',
                               this.classes.nodeOrLeaf);
                                 
  },

  previousSibling: function (node) {
    this._assertNodeOrLeaf(node, 'previousSibling: arg type');
    return Element.navigateDom(node.previousSibling, 'previousSibling',
                               this.classes.nodeOrLeaf);
                                 
  },

  firstSubNode: function (node) {
    node = node || this.rootElement;
    var parent = (node == this.rootElement) ? node 
               : this.isLeaf(node)          ? null
               :                              this.content(node);
    return parent ? Element.navigateDom(parent.firstChild, 'nextSibling',
                                        this.classes.nodeOrLeaf)
                  : null;
  },

  lastSubNode: function (node) {
    node = node || this.rootElement;
    var parent = (node == this.rootElement) ? node 
               : this.isLeaf(node)          ? null
               :                              this.content(node);
    return parent ? Element.navigateDom(parent.lastChild, 'previousSibling',
                                        this.classes.nodeOrLeaf)
                  : null;
  },

  lastVisibleSubnode: function(node) {
    node = node || this.rootElement;
    while(!this.isClosed(node)) {
      var lastSubNode = this.lastSubNode(node);
      if (!lastSubNode) break;
      node = lastSubNode;
    }
    return node;
  },

  // find next displayed node (i.e. skipping hidden nodes).
  nextDisplayedNode: function (node) {
    this._assertNodeOrLeaf(node, 'nextDisplayedNode: arg type');

    // case 1: node is opened and has a subtree : then return first subchild
    if (!this.isClosed(node)) {
      var firstSubNode = this.firstSubNode(node);
      if (firstSubNode) return firstSubNode;
    }
	
    // case 2: current node or one of its parents has a sibling 
    while (node) {
      var sibling = this.nextSibling(node);

      if (sibling) {
        if (this.isVisible(sibling)) 
          return sibling;
        else 
          node = sibling;
      }
      else
        node = this.parentNode(node);
    }

    // case 3: no next Node
    return null;
  },

  // find previous displayed node (i.e. skipping hidden nodes).
  previousDisplayedNode: function (node) {
    this._assertNodeOrLeaf(node, 'previousDisplayedNode: arg type');
    var node_init = node;

    while (node) {
      node = this.previousSibling(node);
      if (node && this.isVisible(node))
        return this.lastVisibleSubnode(node);
    }

    // if no previous sibling
    return this.parentNode(node_init);
  },

  enclosingNode:  function (elem) {
    return Element.navigateDom(
      $(elem), 'parentNode', this.classes.node, 
      this.isRootElement.bind(this));
  },


  // set node background to red for 200 milliseconds
  flash: function (node, milliseconds, color) {

    if (this._isFlashing) return;
    this._isFlashing = true;

    var label         = this.label(node);
    ASSERT(label, "node has no label");
    var previousColor = label.style.backgroundColor;
    var treeNavigator = this;
    var endFlash      = function() {
      treeNavigator._isFlashing = false;
      label.style.backgroundColor = previousColor;
    };
    setTimeout(endFlash, milliseconds || this.options.flashDuration);

    label.style.backgroundColor = color || this.options.flashColor;
  },

  fireEvent: function(eventName, elem) {
    var args = [eventName];
    while (elem) {
      args.push(elem);
      elem = this.parentNode(elem);
    }
    args.push(this.rootElement);
    return GvaScript.fireEvent.apply(this, args);
  },
  
//-----------------------------------------------------
// Private methods
//-----------------------------------------------------

  _assertNode: function(elem, msg) {
    ASSERT(elem && Element.hasAnyClass(elem, this.classes.node), msg);
  },

  _assertNodeOrLeaf: function(elem, msg) {
    ASSERT(elem && Element.hasAnyClass(elem, this.classes.nodeOrLeaf), msg);
  },


  _labelMouseOverHandler: function(event, label) {
      Element.addClassName(label, this.classes.mouse);
      Event.stop(event);
  },

  _labelMouseOutHandler: function(event, label) {
    Element.removeClassName(label, this.classes.mouse);
    Event.stop(event);
  },
  
  _labelClickHandler : function(event, label) {
    var node  = Element.navigateDom(label, 'parentNode',
                                    this.classes.nodeOrLeaf);

    // situation before the click
    var was_selected = this.selectedNode == node;
    var now = (new Date()).getTime(); 
    var just_selected = (now - this._lastSelectTime < this.options.selectDelay);
 
    // select node if necessary
    if (!was_selected) this.select(node);

    // should ping : depends on options.noPingOnFirstClick
    var should_ping = (was_selected && !just_selected) 
                    || !this.options.noPingOnFirstClick;

    // do the ping if necessary
    var event_stop_mode;
    if (should_ping)
      event_stop_mode = this.fireEvent("Ping", node, this.rootElement);

    // avoid a second ping from the dblclick handler
    this.should_ping_on_dblclick = !should_ping; 

    // stop the event unless the ping_handler decided otherwise
    Event.detailedStop(event, event_stop_mode || Event.stopAll);
  },


  _labelDblClickHandler : function(event, label) {
    var event_stop_mode;

    // should_ping_on_dblclick was just set within _labelClickHandler
    if (this.should_ping_on_dblclick) {
      var node = label.parentNode;
      event_stop_mode = this.fireEvent("Ping", node, this.rootElement);
    }

    // stop the event unless the ping_handler decided otherwise
    Event.detailedStop(event, event_stop_mode || Event.stopAll);
  },


  _buttonClickHandler : function(event) {
    var node = Event.element(event).parentNode;
    var method = this.isClosed(node) ? this.open : this.close;
    method.call(this, node);
    if (this.options.selectOnButtonClick)
      this.select(node);
    Event.stop(event);
  },

  _addButtonsAndHandlers: function(labels) {
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      Event.observe(
        label,  "mouseover", 
        this._labelMouseOverHandler.bindAsEventListener(this, label));
      Event.observe(
        label,  "mouseout",  
        this._labelMouseOutHandler.bindAsEventListener(this, label));
      Event.observe(
        label,  "click",
        this._labelClickHandler.bindAsEventListener(this, label));
      Event.observe(
        label,  "dblclick",
        this._labelDblClickHandler.bindAsEventListener(this, label));
      if (this.options.createButtons) {
        var button = document.createElement("span");
        button.className = this.classes.button;
        label.parentNode.insertBefore(button, label);
        Event.observe(
          button, "click",     
          this._buttonClickHandler.bindAsEventListener(this, label));
      }
    }
  },

  _addTabbingBehaviour: function(labels) {
    if (this.options.tabIndex < 0) return; // no tabbing

    // focus and blur do not bubble, so we'll have to insert them
    // in each label element

    var treeNavigator = this; // handlers will be closures on this

    // focus handler
    var focus_handler = function(event) {
      var label = Event.element(event);
      label.setAttribute('hasFocus', true);

      var node  = Element.navigateDom(label, 'parentNode',
                                      treeNavigator.classes.nodeOrLeaf);
                                                 
      // Select, but only if focus was not the consequence of a select action!
      // To distinguish, we use the timestamp of the last select.
      var now = (new Date()).getTime(); 
      var short_delay = 2 * treeNavigator.options.selectDelay;
         // needed to multiply by 2 because focus() is called indirectly by 
         // _selectionTimeoutHandler after selectDelay milliseconds
      if (node && now - treeNavigator._lastSelectTime > short_delay)
        treeNavigator.select(node); 
    };

    // blur handler
    var blur_handler = function(event) {
      var label = Event.element(event);
      label.setAttribute('hasFocus', false);

      // Deselect, but only if blur was not the consequence of a select action!
      // To distinguish, we use the timestamp of the last select.
      var now = (new Date()).getTime(); 
      var short_delay = 2 * treeNavigator.options.selectDelay;
      if (now - treeNavigator._lastSelectTime > short_delay)
        treeNavigator.select(null);
    };

    // apply to each label
    labels.each(function(label) {
                  label.tabIndex = treeNavigator.options.tabIndex;
                  Event.observe(label, "focus", focus_handler);
                  Event.observe(label, "blur", blur_handler);
                });
  },


//-----------------------------------------------------
// timeout handler for firing Select/Deselect events
//-----------------------------------------------------

  _selectionTimeoutHandler: function(previousNode) {
    var now = (new Date()).getTime();
    var deltaDelay = this.options.selectDelay - (now - this._lastSelectTime);

    // if _lastSelectTime is too recent, re-schedule the same handler for later
    if (deltaDelay > 0) {
      var treeNavigator = this;
      var callback = function () {
        treeNavigator._selectionTimeoutHandler(previousNode);
      };

      this._selectionTimeoutId = 
        setTimeout(callback, deltaDelay + 100); // allow for 100 more milliseconds
    }

    // else do the real work
    else { 
      this._selectionTimeoutId = null;
      var newNode = this.selectedNode;

      // set focus
      if (newNode) {
        var label = this.label(newNode);
        if (label && this.options.tabIndex >= 0 
                  && !label.getAttribute('hasFocus') 
                  && this.isVisible(label)) {
            label.focus();
        }
      }

      // fire events
      if (previousNode != newNode) {
        if (previousNode) 
          this.fireEvent("Deselect", previousNode, this.rootElement);
        if (newNode)
          this.fireEvent("Select", newNode, this.rootElement);
      }
    }
  },


//-----------------------------------------------------
// Key handlers
//-----------------------------------------------------

  _downHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      var nextNode = this.nextDisplayedNode(selectedNode);
      if (nextNode) {
        this.select(nextNode);
        Event.stop(event);
      }
      // otherwise: do nothing and let default behaviour happen
    }
  },

  _upHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      var prevNode = this.previousDisplayedNode(selectedNode);
      if (prevNode) {
        this.select(prevNode);
        Event.stop(event);
      }
      // otherwise: do nothing and let default behaviour happen
    }
  },

  _leftHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      if (!this.isLeaf(selectedNode) && !this.isClosed(selectedNode)) { 
        this.close(selectedNode);
      } 
      else {
        var parent = this.parentNode(selectedNode); 
        if (parent) 
          this.select(parent); 
        else
          this.flash(selectedNode); 
      }
      Event.stop(event);
    }
  },

  _rightHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      if (this.isLeaf(selectedNode)) return;
      if (this.isClosed(selectedNode))
        this.open(selectedNode);
      else {
        var subNode = this.firstSubNode(selectedNode); 
        if (subNode) 
          this.select(subNode);
        else
          this.flash(selectedNode);
      }
      Event.stop(event);
    }
  },


  _tabHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode && this.isClosed(selectedNode)) {
      this.open(selectedNode);
      var label = this.label(selectedNode);
      Event.stop(event);
    }
  },

  _kpPlusHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode && this.isClosed(selectedNode)) {
      this.open(selectedNode);
      Event.stop(event);
    }
  },

  _kpMinusHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode && !this.isClosed(selectedNode)) {
      this.close(selectedNode);
      Event.stop(event);
    }
  },

  _kpStarHandler: function (event) {
    var treeNavigator = this;
    var target = this.selectedNode || this.rootElement;
    var nodes = Element.getElementsByClassNames(target, this.classes.node);
    if (target == this.selectedNode) nodes.unshift(target);
    nodes.each(function(node) {treeNavigator.open(node)});
    Event.stop(event);
  },

  _kpSlashHandler: function (event) {
    var treeNavigator = this;
    var target = this.selectedNode || this.rootElement;
    var nodes = Element.getElementsByClassNames(target, this.classes.node);
    if (target == this.selectedNode) nodes.unshift(target);
    nodes.each(function(node) {treeNavigator.close(node)});
    Event.stop(event);
  },

  _ctrl_R_handler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      if (this.loadContent(selectedNode))
        Event.stop(event);
    }
  },

  _ReturnHandler: function (event) {
    var selectedNode = this.selectedNode;
    if (selectedNode) {
      var toStop = this.fireEvent("Ping", selectedNode, this.rootElement);
      Event.detailedStop(event, toStop || Event.stopAll);
    }
  },

  _homeHandler: function (event) {
    if (this.selectedNode) {
        this.select(this.firstSubNode());
        Event.stop(event);
    }
  },

  _endHandler: function (event) {
    if (this.selectedNode) {
        this.select(this.lastVisibleSubnode());
        Event.stop(event);
    }
  },

  _ctrlPgUpHandler: function (event) {
    var node = this.enclosingNode(Event.element(event));
    if (node) this.select(node);
  },

  _ctrlPgDownHandler: function (event) {
    var node = this.enclosingNode(Event.element(event));
    if (node) {
      node = this.nextDisplayedNode(node);
      if (node) this.select(node);
    }
  },

  _chooseLevel: function(event) {
    var level = event.keyCode - "0".charCodeAt(0);
    this.openAtLevel(this.rootElement, level);
  },

  _showAll: function(event, toggle) {
    var method = toggle ? Element.addClassName : Element.removeClassName;
    method(this.rootElement, this.classes.showall);
  }

};

//----------choiceList.js

//----------------------------------------------------------------------
// CONSTRUCTOR
//----------------------------------------------------------------------

GvaScript.ChoiceList = function(choices, options) {
  if (! (choices instanceof Array) )
    throw new Error("invalid choices argument : " + choices);
  this.choices = choices;

  var defaultOptions = {
    labelField       : "label",
    classes          : {},        // see below for default classes
    idForChoices     : "CL_choice",
    keymap           : null,
    grabfocus        : false,
    scrollCount      : 5,
    choiceItemTagName: "div",
    htmlWrapper      : function(html) {return html;}
  };


  this.options = Class.checkOptions(defaultOptions, options);

  var defaultClasses = {
    choiceItem      : "CL_choiceItem",
    choiceHighlight : "CL_highlight"
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);


  // prepare some stuff to be reused when binding to inputElements
  this.reuse = {
    onmouseover : this._listOverHandler.bindAsEventListener(this),
    onclick     : this._clickHandler.bindAsEventListener(this),
    navigationRules: {
      DOWN:      this._highlightDelta.bindAsEventListener(this, 1),
      UP:        this._highlightDelta.bindAsEventListener(this, -1),
      PAGE_DOWN: this._highlightDelta.bindAsEventListener(this, 
                                    this.options.scrollCount),
      PAGE_UP:   this._highlightDelta.bindAsEventListener(this, 
                                    -this.options.scrollCount),
      HOME:      this._highlightDelta.bindAsEventListener(this, -99999),
      END:       this._highlightDelta.bindAsEventListener(this, 99999),
      RETURN:    this._returnHandler .bindAsEventListener(this),
      ESCAPE:    this._escapeHandler .bindAsEventListener(this)
    }
  };
};


GvaScript.ChoiceList.prototype = {

//----------------------------------------------------------------------
// PUBLIC METHODS
//----------------------------------------------------------------------

  fillContainer: function(containerElem) {

    this.container = containerElem;
    this.container.choiceList = this;
    
    Element.update(this.container, this.htmlForChoices());

    // mouse events on choice items will bubble up to the container
    Event.observe(this.container, "mouseover", this.reuse.onmouseover);
    Event.observe(this.container, "click"    , this.reuse.onclick);

    if (this.options.keymap) {
      this.keymap = this.options.keymap;
      this.keymap.rules.push(this.reuse.navigationRules);
    }
    else {
      this.keymap = new GvaScript.KeyMap(this.reuse.navigationRules);
      var target = this.container.tabIndex == undefined 
                     ? document
                     : this.container;
      this.keymap.observe("keydown", target);
    }
    // POTENTIAL PROBLEM HERE : the keymap may stay active
    // even after the choiceList is deleted (may yield memory leaks and 
    // inconsistent behaviour). But we have no "destructor", so how
    // can we unregister the keymap ?


    // highlight the first choice
    this._highlightChoiceNum(0, false);
  },

  updateContainer: function(container, list) {
    this.choices = list;
    Element.update(this.container, this.htmlForChoices());
    this._highlightChoiceNum(0, true);
  },

  htmlForChoices: function(){ // creates the innerHTML 
    var html = "";
    for (var i = 0; i < this.choices.length; i++) {
      var choice = this.choices[i];
      var label  = 
        typeof choice == "string" ? choice : choice[this.options.labelField];

      var id = this.container.id ? this.container.id + "." : '';
      id += this.options.idForChoices + "." + i;
      html += this.choiceElementHTML(label, id);
    }
    return this.options.htmlWrapper(html);
  },

  choiceElementHTML: function(label, id) {
    return "<" + this.options.choiceItemTagName + " class='" + this.classes.choiceItem +  "' id='" + id + "'>" 
           + label + "</" + this.options.choiceItemTagName + ">";
  },

  fireEvent: GvaScript.fireEvent, // must be copied here for binding "this" 


//----------------------------------------------------------------------
// PRIVATE METHODS
//----------------------------------------------------------------------


  //----------------------------------------------------------------------
  // conversion index <=> HTMLElement
  //----------------------------------------------------------------------

  _choiceElem: function(index) { // find DOM element from choice index
    var prefix = this.container.id ? this.container.id + "." : '';
    return $(prefix + this.options.idForChoices + "." + index);
  },

  _choiceIndex: function(elem) {
    return parseInt(elem.id.match(/\.(\d+)$/)[1], 10);
  },


  //----------------------------------------------------------------------
  // highlighting 
  //----------------------------------------------------------------------

  _highlightChoiceNum: function(newIndex, autoScroll) {
    Element.removeClassName(this._choiceElem(this.currentHighlightedIndex), 
                            this.classes.choiceHighlight);
    this.currentHighlightedIndex = newIndex;
    var elem = this._choiceElem(newIndex);
    Element.addClassName(elem, this.classes.choiceHighlight);

    if (autoScroll) 
      Element.autoScroll(elem, this.container, 30); // 30%

    this.fireEvent({type: "Highlight", index: newIndex}, elem, this.container);
  },


  _highlightDelta: function(event, delta) {
    var currentIndex = this.currentHighlightedIndex;
    var nextIndex    = currentIndex + delta;
    if (nextIndex < 0) 
      nextIndex = 0;
    if (nextIndex >= this.choices.length) 
      nextIndex = this.choices.length -1;

    var autoScroll = event && event.keyName; // autoScroll only for key events
    this._highlightChoiceNum(nextIndex, autoScroll);
                             
    if (event) Event.stop(event);
  },


  //----------------------------------------------------------------------
  // navigation 
  //----------------------------------------------------------------------

  _findChoiceItem: function(event) { // walk up DOM to find mouse target
    var stop_condition = function(elem){return elem === this.container};
    return Element.navigateDom(Event.element(event), "parentNode",
                               this.classes.choiceItem,
                               stop_condition);
  },

  _listOverHandler: function(event) {
    var elem = this._findChoiceItem(event);
    if (elem) {
      this._highlightChoiceNum(this._choiceIndex(elem), false);
      if (this.options.grabfocus)
        this.container.focus();
      Event.stop(event);
    }
  },

  // no _listOutHandler needed

  _clickHandler: function(event) {
    var elem = this._findChoiceItem(event);
    if (elem) {
      var toStop = this.fireEvent({type : "Ping", 
                                   index: this._choiceIndex(elem)}, 
                                  elem, 
                                  this.container);
      Event.detailedStop(event, toStop || Event.stopAll);
    }
  },

  _returnHandler: function(event) {
    var index = this.currentHighlightedIndex;
    if (index != undefined) {
      var elem = this._choiceElem(index);
      var toStop = this.fireEvent({type : "Ping", 
                                   index: index}, elem, this.container);
      Event.detailedStop(event, toStop || Event.stopAll);
    }
  },

  _escapeHandler: function(event) {
    var toStop = this.fireEvent("Cancel", this.container);
    Event.detailedStop(event, toStop || Event.stopAll);
  }

};


//----------autoCompleter.js
/** 
TODO: 
  - if ignorePrefix, should highlight current value (not the 1st one)
      a) change in _updateChoicesFunction (because there might be an
         initial value in the form)
      b) what happens if value set programmatically ?
      c) in _checkNewValue : do not destroy the choiceList; just update
         the element

  - BUG: if strict && noBlank && Ajax server down, MSIE takes 100% CPU
  - messages : choose language
  - 'actions' are not documented because the design needs rethinking
**/

//----------------------------------------------------------------------
// CONSTRUCTOR
//----------------------------------------------------------------------

GvaScript.AutoCompleter = function(datasource, options) {

  var defaultOptions = {
    minimumChars     : 1,
    labelField       : "label",
    valueField       : "value",
    autoSuggest      : true,      // will dropDown automatically on keypress
    autoSuggestDelay : 200,       // milliseconds
    typeAhead        : true,      // will fill the inputElement on highlight
    classes          : {},        // see below for default classes
    maxHeight        : 200,       // pixels
    minWidth         : 200,       // pixels
    offsetX          : 0,         // pixels
    strict           : false,     // will not force to take value from choices
    completeOnTab    : true,     // will not force to take value from choices
    blankOK          : true,
    colorIllegal     : "red",
    scrollCount      : 5,
    actionItems      : null,       // choice items to invoke javascript method
    multivalued      : false,
    multivalue_separator :  /[;,\s\t]/,
    choiceItemTagName: "div",
    htmlWrapper      : function(html) {return html;},
    observed_scroll  : null,      // observe the scroll of a given element and move the dropdown accordingly (useful in case of scrolling windows)
    additional_params: null,        //additional parameters with optional default values (only in the case where the datasource is a URL)
    http_method      : 'get' // when additional_params is set, we might to just pass them in the body of the request
  };

  // more options for array datasources
  if (typeof datasource == "object" && datasource instanceof Array) { 
    defaultOptions.ignorePrefix  = false;  // will always display the full list
    defaultOptions.caseSensitive = true;
  }

  this.options = Class.checkOptions(defaultOptions, options);

  var defaultClasses = {
    loading         : "AC_loading",
    dropdown        : "AC_dropdown",
    message         : "AC_message",
    action          : "AC_action"  // undocumented on purpose !
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);
  
  this.separator = new RegExp(this.options.multivalue_separator);
  this.default_separator_char = " "; //character used when the values are joined

  if (this.options.multivalued && this.options.strict) {
    throw new Error("not allowed to have a multivalued autocompleter in strict mode");
  }

  this.dropdownDiv = null;

  // install self-update function, depending on datasource type
  this.updateChoices = this._updateChoicesFunction(datasource);

  // prepare a keymap for all key presses; will be registered at first
  // focus() event; then a second set of keymap rules is pushed/popped
  // whenever the choice list is visible
  var basicHandler = this._keyPressHandler.bindAsEventListener(this);
  var detectedKeys = /^(BACKSPACE|DELETE|.)$/;
                   // catch any single char, plus some editing keys
  var basicMap     = { DOWN: this._keyDownHandler.bindAsEventListener(this),
                       REGEX: [[null, detectedKeys, basicHandler]] };
  this.keymap = new GvaScript.KeyMap(basicMap);

  // prepare some stuff to be reused when binding to inputElements
  this.reuse = {
    onblur  : this._blurHandler.bindAsEventListener(this),
    onclick : this._clickHandler.bindAsEventListener(this)
  };
}


GvaScript.AutoCompleter.prototype = {

//----------------------------------------------------------------------
// PUBLIC METHODS
//----------------------------------------------------------------------

  // called when the input element gets focus
  autocomplete: function(elem) { 
    elem = $(elem);// in case we got an id instead of an element

    if (!elem) throw new Error("attempt to autocomplete a null element");

    // if we were the last to have focus, just recover it, no more work.
    if (elem === this.inputElement) return;

    this.inputElement   = elem;

    if (!elem._autocompleter) { // register handlers only if new elem
      elem._autocompleter = this;
      this.keymap.observe("keydown", elem, { preventDefault:false,
                                             stopPropagation:false});
      Element.observe(elem, "blur", this.reuse.onblur);
      Element.observe(elem, "click", this.reuse.onclick);

      // prevent browser builtin autocomplete behaviour
      elem.setAttribute("autocomplete", "off");
    }

    // initialize time stamps
    this._timeLastCheck = this._timeLastKeyPress = 0;

    // more initialization, but only if we did not just come back from a 
    // click on the dropdownDiv
    if (!this.dropdownDiv) {
      this.lastValue      = null;
      this.fireEvent("Bind", elem);
    }

    this._checkNewValue();
  },

  detach: function(elem) {
    elem._autocompleter = null;
    Element.stopObserving(elem, "blur", this.reuse.onblur);
    Element.stopObserving(elem, "keydown", elem.onkeydown);
  },

  displayMessage : function(message) {
    this._removeDropdownDiv();
    var div = this._mkDropdownDiv();
    div.innerHTML = message;
    Element.addClassName(div, this.classes.message);
  },

  // set additional params for autocompleters that have more than 1 param;
  // second param is the HTTP method (post or get)
  setAdditionalParams : function(params, method) {
    this.additional_params = params;           
    this.http_method = method;
  },

  addAdditionalParam : function(param, value) {
    this.additional_params[param] = value;
  },

  setHttpMethod : function(method) {
    if (method != 'get' || method != 'post') {
        alert('Unrecognised type of http method')
    }
    this.http_method = method;
  }, 

  //
  // TODO: TO BE REMOVED OR COMMITED TO ALIEN PACKAGE
  //
  setdatasource : function(datasource) {
    this.updateChoices = this._updateChoicesFunction(datasource);
  },

  fireEvent: GvaScript.fireEvent, // must be copied here for binding "this" 

  // Set the element for the AC to look at to adapt its position. If elem is
  // null, stop observing the scroll.
  set_observed_scroll : function(elem) {
    if (!elem) {
        Event.stopObserving(this.observed_scroll, 'scroll', correct_dropdown_position);
        return;
    }

    this.observed_scroll = elem;
    this.currentScrollTop = elem.scrollTop;
    this.currentScrollLeft = elem.scrollLeft;
    var correct_dropdown_position = function() {
      if (this.dropdownDiv) {
        var dim = Element.getDimensions(this.inputElement);
        var pos = this.dropdownDiv.positionedOffset()
        this.dropdownDiv.style.top  = pos.top - (this.observed_scroll.scrollTop - this.currentScrollTop) + "px";
        this.dropdownDiv.style.left = pos.left - this.observed_scroll.scrollLeft + "px"; 
      }
      this.currentScrollTop = this.observed_scroll.scrollTop;
      this.currentScrollLeft = this.observed_scroll.scrollLeft;
    }

    Event.observe(elem, 'scroll', correct_dropdown_position.bindAsEventListener(this));
  },


//----------------------------------------------------------------------
// PRIVATE METHODS
//----------------------------------------------------------------------

  // an auxiliary function for the constructor
  _updateChoicesFunction : function(datasource) { 
    if (typeof datasource == "string") { // URL
      return function () {
        var autocompleter = this; // needed for closures below
        autocompleter.inputElement.style.backgroundColor = ""; // remove colorIllegal
        if (this._runningAjax)
          this._runningAjax.transport.abort();
        Element.addClassName(autocompleter.inputElement, this.classes.loading);
        var toCompleteVal = this._getValueToComplete();
        
        //integrate possible additional parameters in the URL request
        var additional_params = this.additional_params;// for example {C_ETAT_AVOC : 'AC'}
        var http_method = this.http_method ? this.http_method : this.options.http_method;
        var partial_url = '';
        if (additional_params && http_method == 'get') {
            for (var key in additional_params) {
                partial_url += "&" + key + "=" + additional_params[key]; 
            }
        } 

        var complete_url = datasource + toCompleteVal + partial_url;
        this._runningAjax = new Ajax.Request(
          complete_url,
          {asynchronous: true,
           method: http_method,
           postBody: this.http_method == 'post' ? Object.toJSON(additional_params) : null,
           contentType: "text/javascript",
           onSuccess: function(xhr) {
              autocompleter._runningAjax = null;

              // do nothing if aborted by the onblur handler
              if(xhr.transport.status == 0) return;

              autocompleter.choices = xhr.responseJSON;
              autocompleter._displayChoices();
           },
           onFailure: function(xhr) {
              autocompleter._runningAjax = null;
              autocompleter.displayMessage("pas de réponse du serveur");
           },
           onComplete: function(xhr) {
              Element.removeClassName(autocompleter.inputElement, 
                                      autocompleter.classes.loading);
           }
          });
        return true; // asynchronous
      };
    }
    else if (typeof datasource == "function") { // callback
      return function() {
        this.inputElement.style.backgroundColor = ""; // remove colorIllegal
        this.choices = datasource(this._getValueToComplete());
        return false; // not asynchronous
      };
    }
    else if (typeof datasource == "object" &&
             datasource instanceof Array) { // in-memory
      return function () {
        this.inputElement.style.backgroundColor = ""; // remove colorIllegal
        if (this.options.ignorePrefix)
          this.choices = datasource;
        else {
            var toCompleteVal = this._getValueToComplete();
            var regex = new RegExp("^" + toCompleteVal,
                                 this.options.caseSensitive ? "" : "i");
          var matchPrefix = function(choice) {
	    var value;
	    switch(typeof choice) {
	      case "object" : value = choice[this.options.valueField]; break;
	      case "number" : value = choice.toString(10); break;
	      case "string" : value = choice; break;
	      default: throw new Error("unexpected type of value");
            }
            return value.search(regex) > -1;
          };
          this.choices = datasource.select(matchPrefix.bind(this));
        }
        return false; // not asynchronous
      };
    }
    else 
      throw new Error("unexpected datasource type");
  },


  _blurHandler: function(event) { // does the reverse of "autocomplete()"

    Element.removeClassName(this.inputElement, this.classes.loading);

    // check if this is a "real" blur, or just a clik on dropdownDiv
    if (this.dropdownDiv) {
      var targ;
      var e = event;
      if (e.target) targ = e.target;
      else if (e.srcElement) targ = e.srcElement;
      if (targ.nodeType && targ.nodeType == 3) // defeat Safari bug
          targ = targ.parentNode;
      var x = Event.pointerX(e) || Position.cumulativeOffset(targ)[0];
      var y = Event.pointerY(e) || Position.cumulativeOffset(targ)[1];
      if (Position.within(this.dropdownDiv, x, y)) {
        // not a "real" blur ==> bring focus back to the input element
        this.inputElement.focus(); // will trigger again this.autocomplete()
        return;
      }
      else {
        this._removeDropdownDiv();
      }
    }
    if (this.options.strict) {
      // initially : not OK unless options.blankOK and value is empty
      var valueOK = this.options.blankOK && this.inputElement.value == "";

      // if choices are known : check if we have one of them
      if (this.choiceList) {
        var index = this.choiceList.currentHighlightedIndex;
        var legal = this._valueFromChoice(index);
        valueOK = this.inputElement.value == legal;
      }

      // else update choices and then check
      else {
        var async = this.updateChoices(); 
        // can only check if in synchronous mode
        if (!async) {
          // if got one single choice, take the canonic form of that one
          if (this.choices.length == 1) { 
            this.inputElement.value 
              = this.lastValue
              = this._valueFromChoice(0); // canonic form
            this.fireEvent({type: "Complete", index: 0}, this.inputElement); 
            valueOK = true;
          }

          // if got many choices and our input is "", check if it belongs there
          else {
            //if ( this.inputElement.value == "" && this.choices.length > 1 ) {
            if ( this.inputElement.value && this.choices.length > 1 ) {
              for (var i = 0; i < this.choices.length; i++) {
                //if length of one element of choicelist is same as length of input.value
                //then they are identical (here no need to check caseSensitive since it is
                //being done when generating choiceList
                if (this._valueFromChoice(i).length == this.inputElement.value.length) {
                  this.inputElement.value 
                      = this.lastValue
                      = this._valueFromChoice(i); // canonic form
                  this.fireEvent({type: "Complete", index: i}, this.inputElement); 
                  valueOK = true;
                  break;
                }
              }
            }
          }
        }
      }

      if (!valueOK) {
        this.inputElement.style.backgroundColor = this.options.colorIllegal;
      }
    }

    if(this._runningAjax) this._runningAjax.transport.abort();
    this.fireEvent("Leave", this.inputElement);
    this.inputElement = null;
  },

  _clickHandler: function(event) {
    var x = event.offsetX || event.layerX; // MSIE || FIREFOX
    if (x > Element.getDimensions(this.inputElement).width - 20) {
        if ( this.dropdownDiv )
            this._removeDropdownDiv(event);
        else
            this._keyDownHandler(event);
    }
  },

  _keyDownHandler: function(event) { 
    var value = this._getValueToComplete(); 
    var valueLength = (value || "").length; 
    if (valueLength < this.options.minimumChars)
      this.displayMessage("liste de choix à partir de " 
                            + this.options.minimumChars + " caractères");
    else 
      this._displayChoices();
    Event.stop(event);
  },

  _keyPressHandler: function(event) { 

    // after a blur, we still get a keypress, so ignore it
    if (!this.inputElement) return; 
    
    // first give back control so that the inputElement updates itself,
    // then come back through a timeout to update the Autocompleter

    // cancel pending timeouts because we create a new one
    if (this._timeoutId) clearTimeout(this._timeoutId);

    this._timeLastKeyPress = (new Date()).getTime(); 
    this._timeoutId = setTimeout(this._checkNewValue.bind(this), 
                                 this.options.autoSuggestDelay);
    // do NOT stop the event here .. inputElement needs to get the event
  },


  _checkNewValue: function() { 

    // ignore this keypress if after a blur (no input element)
    if (!this.inputElement) return; 

    // several calls to this function may be queued by setTimeout,
    // so we perform some checks to avoid doing the work twice
    if (this._timeLastCheck > this._timeLastKeyPress)
      return; // the work was done already
    var now = (new Date()).getTime();
    var deltaTime = now - this._timeLastKeyPress;
    if (deltaTime <  this.options.checkvalueDelay) 
      return; // too young, let olders do the work

    // OK, we really have to check the value now
    this._timeLastCheck = now;
    var value = this.inputElement.value; //normal case
    if (this.options.multivalued) { 
        var vals = (this.inputElement.value).split(this.separator);
        var value = vals[-1];
    }
    if (value != this.lastValue) {
      this.lastValue = value;
      this.choices = null; // value changed, so invalidate previous choices
      this.choiceList = null;

      if (value.length >= this.options.minimumChars
          && this.options.autoSuggest)
        this._displayChoices();
      else
        this._removeDropdownDiv();
    }
  },

  // return the value to be completed; added for multivalued autocompleters                  
  _getValueToComplete : function() {
    var toCompleteVal = this.inputElement.value;
    if (this.options.multivalued) {
        vals = (this.inputElement.value).split(this.separator);
        toCompleteVal = vals[vals.length-1].replace(/\s+/, "");
    }
    return toCompleteVal;
  },

  // set the value of the field; used to set the new value of the field once the user 
  // pings a choice item 
  _setValue : function(value) {              
    if (!this.options.multivalued) {
        this.inputElement.value = value;
    } else {
        var vals = (this.inputElement.value).split(this.separator);
        var result = (this.separator).exec(this.inputElement.value);
        if (result) {
            var user_sep = result[0];
        }
        vals[vals.length-1] = value;
        this.inputElement.value = (vals).join(user_sep); 
    }
  
  },

  _typeAhead : function () {
    var curLen     = this.lastValue.length;
    var index      = this.choiceList.currentHighlightedIndex; 
    var suggestion = this._valueFromChoice(index);
    var newLen     = suggestion.length;
    this.inputElement.value = suggestion;

    if (this.inputElement.createTextRange){ // MSIE
      var range = this.inputElement.createTextRange();
      range.moveStart("character", curLen); // no need to moveEnd
      range.select(); // will call focus();
    }
    else if (this.inputElement.setSelectionRange){ // Mozilla
      this.inputElement.setSelectionRange(curLen, newLen);
    }
  },



//----------------------------------------------------------------------
// methods for the dropdown list of choices
//----------------------------------------------------------------------

  _mkDropdownDiv : function() {
    this._removeDropdownDiv();

    // if observed element for scroll, reposition
    var movedUpBy = 0;
    var movedLeftBy = 0;
    if (this.observed_scroll) {
        movedUpBy = this.observed_scroll.scrollTop;
        movedLeftBy = this.observed_scroll.scrollLeft;
    }

    // create div
    var div    = document.createElement('div');
    div.className = this.classes.dropdown;

    // positioning
    var coords = Position.cumulativeOffset(this.inputElement);
    var dim    = Element.getDimensions(this.inputElement);
    div.style.left      = coords[0] + this.options.offsetX - movedLeftBy + "px";
    div.style.top       = coords[1] + dim.height -movedUpBy + "px";
    div.style.maxHeight = this.options.maxHeight + "px";
    div.style.minWidth  = this.options.minWidth + "px";
    div.style.zIndex    = 32767; //Seems to be the highest valid value

    // insert into DOM
    document.body.appendChild(div);

    // simulate maxHeight/minWidth on old MSIE (must be AFTER appendChild())
    if (navigator.userAgent.match(/\bMSIE [456]\b/)) {
      div.style.setExpression("height", 
        "this.scrollHeight>" + this.options.maxHeight + "?" 
                             + this.options.maxHeight + ":'auto'");
      div.style.setExpression("width", 
        "this.scrollWidth<" + this.options.minWidth + "?" 
                            + this.options.minWidth + ":'auto'");
    }

    return this.dropdownDiv = div;
  },



  _displayChoices: function() {
    var toCompleteVal = this._getValueToComplete();
    if (!this.choices) {
      var asynch = this.updateChoices(toCompleteVal);
      if (asynch) return; // updateChoices() is responsible for calling back
    }

    if (this.options.actionItems) {
      var action = this.options.actionItems;
      for (var k=0; k < action.length; k++) {
        var action_label = action[k][this.options.labelField];
        action[k][this.options.labelField] = "<span class=" + this.classes.action + ">" + action_label + "</span>";
        this.choices[this.choices.length] = action[k];
      }
    }

    if (this.choices.length > 0) {
      var ac = this;
      var cl = this.choiceList = new GvaScript.ChoiceList(this.choices, {
        labelField        : this.options.labelField,
        scrollCount       : this.options.scrollCount,
        choiceItemTagName : this.options.choiceItemTagName,
        htmlWrapper       : this.options.htmlWrapper
      });


      // TODO: explain and publish method "choiceElementHTML", or redesign
      // and make it a private method
      if ( this.choiceElementHTML ) {
        cl.choiceElementHTML = this.choiceElementHTML;
      }

      cl.onHighlight = function(event) {
        if (ac.options.typeAhead) 
          ac._typeAhead();
        ac.fireEvent(event, ac.inputElement);
      };
      cl.onPing = function(event) {
        ac._completeFromChoiceElem(event.target);
      };
      cl.onCancel = function(event) {
        ac._removeDropdownDiv();
      };

      // fill container now so that the keymap gets initialized
      cl.fillContainer(this._mkDropdownDiv());

      // playing with the keymap: when tabbing, should behave like RETURN
      var autocompleter = this;
      cl.keymap.rules[0].TAB = cl.keymap.rules[0].S_TAB = function(event) {
        if (!autocompleter.options.completeOnTab)
            return;
        var index = cl.currentHighlightedIndex;
        if (index != undefined) {
          var elem = cl._choiceElem(index);
          // Only return and click events should launch action items
          if (ac.choices[index]['action'])
              return;
          cl.fireEvent({type : "Ping", 
                        index: index}, elem, cl.container);
          // NO Event.stop() here
        }
      };

      // more key handlers when the suggestion list is displayed
      this.keymap.rules.push(cl.keymap.rules[0]);

    }
    else 
      this.displayMessage("pas de suggestion");
  },


  _removeDropdownDiv: function(event) { // may be choices div or message div
    if (this.keymap.rules.length > 1)
      this.keymap.rules.pop(); // remove navigationRules

    if (this.dropdownDiv) {
      Element.remove(this.dropdownDiv);
      this.dropdownDiv = null;
    }
    if (event) Event.stop(event);
  },


  _valueFromChoice: function(index) {
    if (!this.choices || this.choices.length < 1) return null;
    var choice = this.choices[index];
    return (typeof choice == "string") ? choice 
                                       : choice[this.options.valueField];
  },


  //triggered by the onPing event on the choicelist, i.e. when the user selects
  //one of the choices in the list
  _completeFromChoiceElem: function(elem) {
    // identify the selected line and handle it
    var num = parseInt(elem.id.match(/\.(\d+)$/)[1], 10);
    var choice = this.choices[num];
    if (!choice && choice!="" && choice!=0) 
        throw new Error("choice number is out of range : " + num);
    var action = choice['action'];
    if (action) {
        this._removeDropdownDiv(); 
        eval(action);
        return;
    }

    // add the value to the input element
    var value = this._valueFromChoice(num);
    //if (value) {
      this.lastValue = value;
      this._setValue(value)
//      this.inputElement.value = this.lastValue = value;
      this.inputElement.jsonValue = choice; //never used elsewhere?!
      this._removeDropdownDiv();
      if (!this.options.multivalued) {
        this.inputElement.select();
      } 
      this.fireEvent({type: "Complete", index: num}, elem, this.inputElement); 
    //} else {
    //}
    // else WHAT ??
    //    - might have other things to trigger (JS actions / hrefs)
  }

}


//----------repeat.js
/* TODO :
    - invent syntax for IF blocks (first/last, odd/even)
*/

GvaScript.Repeat = {

//-----------------------------------------------------
// Public methods
//-----------------------------------------------------

  init: function(elem) {
    this._init_repeat_elements(elem);
  },

  add: function(repeat_name, count) {
    if (count == undefined) count = 1;

    // get repeat properties
    var placeholder = this._find_placeholder(repeat_name);
    var repeat      = placeholder.repeat;
    var path_ini    = repeat.path;

    // regex substitutions to build html for the new repetition block (can't
    // use Template.replace() because we need structured namespaces)
    var regex       = new RegExp("#{" + repeat.name + "\\.(\\w+)}", "g");
    var replacement = function ($0, $1){var s = repeat[$1]; 
                                        return s == undefined ? "" : s};

    while (count-- > 0 && repeat.count < repeat.max) {
      // increment the repetition block count and update path
      repeat.ix    = repeat.count++;  // invariant: count == ix + 1
      repeat.path  = path_ini + "." + repeat.ix;

      // compute the HTML
      var html  = repeat.template.replace(regex, replacement);

      // insert into the DOM
      placeholder.insert({before:html});
      var insertion_block = $(repeat.path);
  
      // repetition block gets an event
      placeholder.fireEvent("Add", insertion_block);

      // deal with nested repeated sections
      this._init_repeat_elements(insertion_block, repeat.path);

      // restore initial path
      repeat.path = path_ini;
    }

    return repeat.count;
  },

  remove: function(repetition_block) {
    // find element, placeholder and repeat info
    var elem = $(repetition_block);
    elem.id.match(/(.*)\.(\d+)$/);
    var repeat_name = RegExp.$1;
    var remove_ix   = RegExp.$2;
    var placeholder = this._find_placeholder(repeat_name);
    var max         = placeholder.repeat.count;

    // remove the repeat block and all blocks above
    for (var i = remove_ix; i < max; i++) {
      var block = $(repeat_name + "." + i);
      placeholder.fireEvent("Remove", block);
      block.remove();
      placeholder.repeat.count -= 1;
    }        

    // add again the blocks above (which will be renumbered)
    var n_add = max - remove_ix - 1;
    if (n_add > 0) this.add(placeholder, n_add);
  },



//-----------------------------------------------------
// Private methods
//-----------------------------------------------------

  _find_placeholder: function(name) {
    if (typeof name == "string" && !name.match(/.placeholder$/))
        name += ".placeholder";
    var placeholder = $(name); 
    if (!placeholder) throw new Error("no such element: " + name);
    return placeholder;
  },

  _init_repeat_elements: function(elem, path) {
    elem = $(elem);
    if (elem) {
      var elements = this._find_repeat_elements(elem);
      for (var i = 0; i < elements.length; i++) {
        this._init_repeat_element(elements[i], path);
      }
    }
  },

  _find_repeat_elements: function(elem) {
    var result = [];

    // navigate DOM, do not recurse under "repeat" nodes
    for (var child = elem.firstChild; child; child = child.nextSibling) {
      var has_repeat = child.nodeType == 1 && child.getAttribute('repeat');
      result.push(has_repeat ? child : this._find_repeat_elements(child));
    }
    return result.flatten();
  },

  _init_repeat_element: function(element, path) {
    element = $(element);
    path = path || element.getAttribute('repeat-prefix');

    // number of initial repetition blocks
    var n_blocks = element.getAttribute('repeat-start');
    if (n_blocks == undefined) n_blocks = 1;

    // hash to hold all properties of the repeat element
    var repeat = {};
    repeat.name  = element.getAttribute('repeat');
    repeat.min   = element.getAttribute('repeat-min') || 0;
    repeat.max   = element.getAttribute('repeat-max') || 99;
    repeat.count = 0;
    repeat.path  = (path ? path + "." : "") + repeat.name;

    // create a new element (placeholder for new insertion blocks)
    var placeholder_tag = element.tagName.match(/^(TR|TD|TBODY|THEAD|TH)$/i) 
                          ? element.tagName 
                          : 'SPAN';
    var placeholder     = document.createElement(placeholder_tag);
    placeholder.id = repeat.path + ".placeholder";
    placeholder.fireEvent = GvaScript.fireEvent;
    element.parentNode.insertBefore(placeholder, element);

    // take this elem out of the DOM and into a string ...
    {
      // a) force the id that will be needed in the template)
      element.id = "#{" + repeat.name + ".path}";

      // b) remove "repeat*" attributes (don't want them in the template)
      var attrs = element.attributes;
      var repeat_attrs = [];
      for (var i = 0; i < attrs.length; i++) {
        var name = attrs[i].name;
        if (name.match(/^repeat/i)) repeat_attrs.push(name);
      }
      repeat_attrs.each(function(name){element.removeAttribute(name, 0)});

      // c) keep it as a template string and remove from DOM
      repeat.template = Element.outerHTML(element);
      element.remove();
    }

    // store all properties within the placeholder
    placeholder.repeat = repeat;

    // create initial repetition blocks 
    this.add(placeholder, n_blocks);
  }

};

//----------form.js
/* TODO

   - submit attrs on buttons
       - action / method / enctype / replace / target / novalidate
  - after_submit:
        - 204 NO CONTENT : leave doc, apply metadata
        - 205 RESET CONTENT : reset form
        - replace="document" (new page)
        - replace="values" (fill form with new tree)
        - relace element
        - others ?
        - "onreceive" event (response after submit)

  - check prototype.js serialize on multivalues
*/

GvaScript.Form = {

  init: function(form, tree) {
    GvaScript.Repeat.init(form);
    if (tree)
      this.fill_from_tree(form, "", tree);
    this.autofocus(form);
  },


  to_hash: function(form) {
    return $(form).serialize({hash:true});
  },


  to_tree: function(form) {
    return this.expand_hash(this.to_hash(form));
  },


  fill_from_tree : function(form, field_prefix, tree) {
    form = $(form);
    for (var key in tree) {
      if (!tree.hasOwnProperty(key)) 
        continue;
      var val = tree[key];
      var new_prefix = field_prefix ? field_prefix+'.'+key : key;

      switch (typeof(val)) {

      case "boolean" :
        val = val ? "true" : "";
        // NO break here

      case "number":
      case "string":
        var elem = form[new_prefix];
        if (elem) 
          this._fill_from_value(elem, val); 
        break;

      case "object":
        if (val instanceof Array) 
          this._fill_from_array(form, new_prefix, val);
        else 
          this.fill_from_tree(form, new_prefix, val);
        break;

      case "function":
      case "undefined":
        // do nothing
      }
    }
  },


  _fill_from_array: function(form, field_prefix, array) {
    for (var i=0; i < array.length; i++) {
      var new_prefix = field_prefix + "." + i;

      // if form has a corresponding named element, fill it
      var elem = form[new_prefix];
      if (elem)
        this._fill_from_value(elem, array[i]);

      // otherwise try to walk down to a repetition block
      else {

        // try to find an existing repetition block
        elem = $(new_prefix); // TODO : check: is elem in form ?

        // no repetition block found, try to instanciate one
        if (!elem) { 
          var placeholder = $(field_prefix + ".placeholder");
          if (placeholder && placeholder.repeat) {
            GvaScript.Repeat.add(placeholder, i + 1 - placeholder.repeat.count);
            elem = $(new_prefix);
          }
        }

        // recurse to the repetition block
        if (elem)
          this.fill_from_tree(form, new_prefix, array[i]);
      }           
    }
  },



  _fill_from_value: function(elem, val) {
        // IMPLEMENTATION NOTE : Form.Element.setValue() is quite similar,
        // but our treatment of arrays is different, so we have to reimplement

    // force val into an array
    if (!(val instanceof Array)) val = [val]; 

    // get element type (might be a node list, which we call "collection")
    var elem_type = elem.type 
                 || (elem.length !== undefined ? "collection" : "unknown");

    switch (elem_type) {
      case "collection":
        for (var i=0; i < elem.length; i++) {
          this._fill_from_value(elem.item(i), val);
        }
        break;

      case "checkbox" :
      case "radio":
        elem.checked = val.include(elem.value);
        break;

      case "text" :
      case "textarea" :
      case "hidden" :
        elem.value = val.join(",");
        break;

      case "select-one" :
      case "select-multiple" :
        $A(elem.options).each(function(opt){
          var opt_value = Form.Element.Serializers.optionValue(opt);
          opt.selected = val.include(opt_value);
        });
        break;

      default:
        throw new Error("unexpected elem type : " + elem.type);
    } // end switch
  }, // end function


  // javascript version of Perl  CGI::Expand::expand_hash
  expand_hash: function(flat_hash) {
    var tree = {};

    // iterate on keys in the flat hash
    for (var k in flat_hash) {
      var parts = k.split(/\./);
      var loop = {tree: tree, key: "root"};

      // iterate on path parts within the key
      for (var i = 0 ; i < parts.length; i++) {
        var part = parts[i];

        // if no subtree yet, build it (Array or Object)
        if (!loop.tree[loop.key])
          loop.tree[loop.key] = part.match(/^\d+$/) ? [] : {};

        // walk down to subtree
        loop = {tree: loop.tree[loop.key], key:part};
      }
      // store value in leaf
      loop.tree[loop.key] = flat_hash[k];
    }
    return tree.root;
  }, 


  add: function(repeat_name, count) {
    var n_blocks = GvaScript.Repeat.add(repeat_name, count);
    var last_block = repeat_name + "." + (n_blocks - 1);
    this.autofocus(last_block);
  },

  remove: function(repetition_block) {
    // find element and repeat info
    var elem = $(repetition_block);
    elem.id.match(/(.*)\.(\d+)$/);
    var repeat_name = RegExp.$1;
    var remove_ix   = RegExp.$2;
    var form        = elem.up('form');

    // get form data corresponding to the repeated section (should be an array)
    var tree  = this.to_tree(form);
    var parts = repeat_name.split(/\./);
    for (var i = 0 ; i < parts.length; i++) {
      if (!tree) break;
      tree = tree[parts[i]];
    }
    
    // remove rows below, and shift rows above
    if (tree && tree instanceof Array) {
      tree.splice(remove_ix, 1);
      for (var i = 0 ; i < remove_ix; i++) {
        delete tree[i];
      }
    }

    // call Repeat.remove() to remove from DOM
    GvaScript.Repeat.remove(repetition_block);

    // re-populate blocks above
    this.fill_from_tree(form, repeat_name, tree);
  },

  autofocus: function(elem) {
    elem = $(elem);
    if (elem) {
      var target = elem.down('[autofocus]');
      // TODO : check if target is visible
      if (target) try {target.focus()} 
                     catch(e){}
    }
  }


};
