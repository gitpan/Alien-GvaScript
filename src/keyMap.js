/* Keymap handler, v0.1, Sept 2006, by laurent.dami AT justice.ge.ch.
   See companion file "Keymap.pod" for documentation and license.
*/

// TODO : add a notion of "AntiRegex"

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
                 || rules[event.keyModifiers + keyCode];
      if (handler) 
	return handler;

      if (!rules.REGEX) 
	continue;

      for (var j = 0; j < rules.REGEX.length; j++) {
	var rule = rules.REGEX[j];
        var modifiers = rule[0];
        var regex     = rule[1];
        var handler   = rule[2];

        // build regex if it was passed as a string
	if (typeof(regex) == "string") 
            regex = new RegExp("^(" + regex + ")$");

        var same_modifiers = modifiers == null 
                          || modifiers == event.keyModifiers;
	if (same_modifiers && regex.test(event.keyName))
            return handler;
      }
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
        this.rules.push(KeyMap.MapAllKeys(one_time_handler));
    }
};

