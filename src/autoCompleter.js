/** 
TODO: 
  - if ignorePrefix, should highlight current value (not the 1st one)
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
    blankOK          : true,
    colorIllegal     : "red",
    actionItems      : null       // choice items to invoke javascript method
  };

  // more options for array datasources
  if (typeof datasource == "object" && datasource instanceof Array) { 
    defaultOptions.ignorePrefix  = false;  // will always display the full list
    defaultOptions.caseSensitive = true;
  }



  this.options = Class.checkOptions(defaultOptions, options);

  var defaultClasses = {
    dropdown        : "AC_dropdown",
    message         : "AC_message",
    loading         : "AC_loading",
    action          : "AC_action"
  };
  this.classes = Class.checkOptions(defaultClasses, this.options.classes);

  this.dropdownDiv = null;

  // install self-update function, depending on datasource type
  this.updateChoices = this._updateChoicesFunction(datasource);

  // prepare a keymap for all key presses; will be registered at first
  // focus() event; then a second set of keymap rules is pushed/popped
  // whenever the choice list is visible
  var basicHandler = this._keyPressHandler.bindAsEventListener(this);
  var basicMap     = GvaScript.KeyMap.MapAllKeys(basicHandler);
  this.keymap = new GvaScript.KeyMap(basicMap);

  // prepare some stuff to be reused when binding to inputElements
  this.reuse = {
    onblur : this._blurHandler.bindAsEventListener(this)
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

  fireEvent: GvaScript.fireEvent, // must be copied here for binding "this" 


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
        this._runningAjax = new Ajax.Request(
          datasource + autocompleter.inputElement.value,
          {asynchronous: true,
           onSuccess: function(xhr) {
              autocompleter._runningAjax = null;
              autocompleter.choices = eval("(" + xhr.responseText + ")");
              autocompleter._displayChoices();
           },
           onFailure: function(xhr) {
              autocompleter._runningAjax = null;
              autocompleter.displayMessage("Ajax request failed");
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
        this.choices = datasource(this.inputElement.value);
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
          var regex = new RegExp("^" + this.inputElement.value,
                                 this.options.caseSensitive ? "" : "i");
          var matchPrefix = function(choice) {
            var value = 
              (typeof choice == "string") ? choice 
                                          : choice[this.options.valueField];
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
      var x = Event.pointerX(window.event);
      var y = Event.pointerY(window.event);
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
      var valueOK = false;
      if (this.choiceList) {
        var index = this.choiceList.currentHighlightedIndex;
        var legal = this._valueFromChoice(index);
        if (legal == null && this.options.blankOK)
          legal = "";
        valueOK = this.inputElement.value == legal;
      }
      if (!valueOK) {
        // this.displayMessage("not a legal value"); 
        // this.inputElement.select(); 
        this.inputElement.style.backgroundColor = this.options.colorIllegal;
      }
    }
        
    this.fireEvent("Leave", this.inputElement);
    this.inputElement = null;
  },


  _keyPressHandler: function(event) { 

    // after a blur, we still get a keypress, so ignore it
    if (!this.inputElement) return; 

    if (event.keyName == "DOWN") { // user wants the list now ==> no timeout
      if (!this.inputElement.value || (this.inputElement.value.length < this.options.minimumChars))
        this.displayMessage("liste de choix à partir de " 
                            + this.options.minimumChars + " caractères");
      else 
        this._displayChoices();
      Event.stop(event);
    }
    else if (! /^(SHIFT|CTRL|ALT|LEFT|RIGHT)$/.test(event.keyName)) {
      // first give back control so that the inputElement updates itself,
      // then come back through a timeout to update the Autocompleter

      // cancel pending timeouts because we create a new one
      if (this._timeoutId) clearTimeout(this._timeoutId);

      this._timeLastKeyPress = (new Date()).getTime(); 
      this._timeoutId = setTimeout(this._checkNewValue.bind(this), 
                                   this.options.autoSuggestDelay);
      // do NOT stop the event here .. inputElement needs to get the event
    }
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
    var value = this.inputElement.value;
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

    // create div
    var div    = document.createElement('div');
    div.className = this.classes.dropdown;

    // positioning
    var coords = Position.cumulativeOffset(this.inputElement);
    var dim    = Element.getDimensions(this.inputElement);
    div.style.left      = (coords[0]+this.options.offsetX) + "px";
    div.style.top       = coords[1] + dim.height + "px";
    div.style.maxHeight = this.options.maxHeight + "px";
    div.style.minWidth  = this.options.minWidth + "px";

    // insert into DOM
    document.body.appendChild(div);

    // simulate maxHeight/minWidth on MSIE (must be AFTER appendChild())
    if (navigator.appVersion.match(/\bMSIE\b/)) {
      div.style.setExpression("height", 
        "this.scrollHeight>" + this.options.maxHeight + "?" + this.options.maxHeight + ":'auto'");
      div.style.setExpression("width", 
        "this.scrollWidth<" + this.options.minWidth + "?" + this.options.minWidth + ":'auto'");
    }

    return this.dropdownDiv = div;
  },



  _displayChoices: function() {
    if (!this.choices) {
      var asynch = this.updateChoices();
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
        labelField : this.options.labelField
        });

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
      cl.keymap.rules[0].TAB = cl.keymap.rules[0].S_TAB = function(event) {
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



  _completeFromChoiceElem: function(elem) {
    var num = parseInt(elem.id.match(/\.(\d+)$/)[1], 10);

    var choice = this.choices[num];
    if (!choice) throw new Error("choice number is out of range : " + num);
    var action = choice['action'];
    if (action) {
        this._removeDropdownDiv(); 
        eval(action);
        return;
    }
    var value = this._valueFromChoice(num);
    if (value) {
      this.inputElement.value = this.lastValue = value;
      this.inputElement.jsonValue = choice;
      this._removeDropdownDiv();
      this.inputElement.select();
      this.fireEvent({type: "Complete", index: num}, elem, this.inputElement); 
    } else {
    }
    // else WHAT ??
    //    - might have other things to trigger (JS actions / hrefs)
  }

}
