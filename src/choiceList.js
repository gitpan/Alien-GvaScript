
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
    scrollCount      : 5
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
    return html;
  }, 

  choiceElementHTML: function(label, id) {
    return "<div class='" + this.classes.choiceItem +  "' id='" + id + "'>" + label + "</div>";
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
      Element.autoScroll(elem, 30); // 30%

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

