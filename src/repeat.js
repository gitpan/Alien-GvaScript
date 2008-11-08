GvaScript.Repeat = {

//-----------------------------------------------------
// Public methods
//-----------------------------------------------------

  init: function(elem) {
    this._init_repeat_elements(elem);
  },

  add: function(placeholder) {

    // find the placeholder element
    if (typeof placeholder == "string" && !placeholder.match(/.placeholder$/))
        placeholder += ".placeholder";
    placeholder = $(placeholder);

    // repeat properties
    var repeat = placeholder.repeat;

    // won't add beyond max
    if (repeat.count >= repeat.max)
      return;

    // increment the repetition block count and update path
    var path_ini = repeat.path; // for restoring later; see end of block
    repeat.ix    = ++repeat.count;
    repeat.path  = repeat.path + "." + repeat.ix;

    // regex substitutions to build html for the new repetition block (can't
    // do it with Template.replace() because working in only one namespace)
    var regex = new RegExp("#{" + repeat.name + "\\.(\\w+)}", "g");
    var repl  = function ($0, $1){return repeat[$1] || ""};
    var html  = repeat.template.replace(regex, repl);

    // insert into the DOM
    placeholder.insert({before:html});
    var insertion_block = $(repeat.path);
  
    // repetition block gets an event
    placeholder.fireEvent("Repeat", insertion_block);

    // deal with nested repeated sections
    this._init_repeat_elements(insertion_block, repeat.path);

    // restore initial path, because unlike Perl, JS has no "local" :-( 
    repeat.path = path_ini;
  },


//-----------------------------------------------------
// Private methods
//-----------------------------------------------------


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

    // hash to hold all properties of the repeat element
    var repeat = {};
    repeat.name  = element.getAttribute('repeat');
    repeat.min   = element.getAttribute('repeat-min') || 1,
    repeat.max   = element.getAttribute('repeat-max') || 99,
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
      for (var prop in element) {
        if (prop.match(/^repeat/i))  element.removeAttribute(prop, 0);
      }

      // c) remove from DOM and keep it as a template string
      // outerHTML would be simpler, but not supported by Gecko :-((
      repeat.template = Element.outerHTML(element);
      element.remove();

//       var div = document.createElement("div");
//       element = 
//       div.appendChild(element);
//       repeat.template = div.innerHTML;

    }

    // store all properties within the placeholder
    placeholder.repeat = repeat;

    // initial repetition blocks 
    var n_start = element.getAttribute('repeat-start') || repeat.min;
    for (var i = 1; i <= n_start; i++) {
      this.add(placeholder);
    }
  }

};
