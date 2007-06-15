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


  autoScroll: function(elem, percentage) {
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

     var min = offset - (parent.clientHeight * (100-percentage)/100);
     var max = offset - (parent.clientHeight * percentage/100);
     if      (parent.scrollTop < min) parent.scrollTop = min;
     else if (parent.scrollTop > max) parent.scrollTop = max;
  },

  outerHTML: function(elem) {
     var tag = elem.tagName;
     if (!tag)
         return elem;
     if (elem.outerHTML) {
         return elem.outerHTML;
     } else {
         var attrs = elem.attributes;
         var str = "<" + tag;
         for (var i = 0; i < attrs.length; i++)
             str += " " + attrs[i].name + "=\"" + attrs[i].value + "\"";

         return str + ">" + elem.innerHTML + "</" + elem.tagName + ">";
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

