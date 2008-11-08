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
