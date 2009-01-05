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

