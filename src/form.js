/* 
TODO

  - submit

     enctype attr
     after_submit:
        - replace document
        - replace values
        - relace element
        - others ?
   - submit attrs on buttons
       - action / method / enctype / replace / target

  - "onreceive" event (response after submit)

  - autofocus

  - check prototype.js serialize on multivalues

*/

GvaScript.Form = {

  init: function(form, tree) {
    GvaScript.Repeat.init(form);
    if (tree)
      this.fill_from_tree(form, "", tree);

    // TODO : enctype, onsubmit, etc.

  },


  to_hash: function(form) {
    return $(form).serialize({hash:true});
  },


  to_tree: function(form) {
    return this.expand_hash(this.to_hash(form));
  },


  fill_from_tree : function(form, field_prefix, tree) {
    form = $(form);
    if (!form)
      return;

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
    for (var i=1; i < array.length; i++) {
      var new_prefix = field_prefix + "." + i;

      // if form has a named element, fill it
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
            while (placeholder.repeat.count < i
                   && placeholder.repeat.count < placeholder.repeat.max) {
              GvaScript.Repeat.add(placeholder);
            }
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
    
    if (!(val instanceof Array)) 
      val = [val]; // force into an array

    if (elem.length !== undefined) { // if elem is a collection
      for (var i=0; i < elem.length; i++) {
        this._fill_from_value(elem.item(i), val);
      }
    }
    else { // if elem is a single node
      switch (elem.type) {
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
            opt.selected = val.include(opt.value);
          });
          break;

        default:
          alert("unexpected elem type : " + elem.type);
      } // end switch
    } // end if
  }, // end function


  // javascript version of CGI::Expand::expand_hash
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
  }


};
