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
