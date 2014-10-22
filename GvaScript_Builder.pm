package GvaScript_Builder;
use base 'Module::Build';

use strict;
use warnings;


# some files in the distribution are derived from pod and pm sources
# so we regenerate them when doing actions "build" or "distdir"

sub ACTION_build{
  my $self = shift;
  $self->generate_from_sources;
  $self->SUPER::ACTION_build();
}

sub ACTION_distdir{
  my $self = shift;
  $self->generate_from_sources;
  $self->SUPER::ACTION_distdir();
}


sub generate_from_sources {
  my ($self) = @_;
  $self->generate_js;
  eval {$self->generate_html}; # might fail if Pod::POM is not installed
}


sub generate_js { # concatenates sources below into "GvaScript.js"
  my ($self) = @_;
  require "lib/Alien/GvaScript.pm";

  my @sources = qw/protoExtensions event keyMap 
                   treeNavigator choiceList autoCompleter
                   repeat form/;
  my $dest = "lib/Alien/GvaScript/lib/GvaScript.js";
  chmod 0777, $dest;
  open my $dest_fh, ">$dest"  or die "open >$dest : $!";

  print $dest_fh <<__EOJS__;
/*-------------------------------------------------------------------------*
 * GvaScript - Javascript framework born in Geneva.
 *
 *  Authors: Laurent Dami            <laurent.d...\@etat.ge.ch>
 *           Jean-Christophe Durand  <jean-christophe.d.....\@etat.ge.ch>
 *  LICENSE
 *  This library is free software, you can redistribute it and/or modify
 *  it under the same terms as Perl's artistic license.
 *
 *--------------------------------------------------------------------------*/

var GvaScript = {
  Version: '$Alien::GvaScript::VERSION'
}
__EOJS__

  foreach my $sourcefile (@sources) {
    open my $fh, "src/$sourcefile.js" or die $!;
    print $dest_fh "\n//----------$sourcefile.js\n", <$fh>;
  }
}

sub generate_html {# regenerate html doc from pod sources
  my ($self) = @_;

  require Pod::POM;
  require Pod::POM::View::HTML;

  my @podfiles = glob ("lib/Alien/GvaScript/*.pod");
  my $parser = new Pod::POM;

  foreach my $podfile (@podfiles) {
    my $pom = $parser->parse($podfile) or die $parser->error;
    $podfile =~ m[^lib/Alien/GvaScript/(.*)\.pod];
    my $htmlfile = "lib/Alien/GvaScript/html/$1.html";
    print STDERR "converting $podfile ==> $htmlfile\n";
    open my $fh, ">$htmlfile" or die "open >$htmlfile: $!";
    print $fh Pod::POM::View::HTML::GvaScript->print($pom);
    close $fh;
  }
  return 1;
}

1;


#======================================================================
package Pod::POM::View::HTML::GvaScript;
#======================================================================
use strict;
use warnings;

use base 'Pod::POM::View::HTML';

sub _title_to_id {
  my $title = shift;
  $title =~ s/<.*?>//g; # no tags
  $title =~ s/\W+/_/g;
  return $title;
}


sub view_pod {
  my ($self, $pod) = @_;

  my $doc_title = ($pod->head1)[0]->content->present($self);
  $doc_title =~ s/<.*?>//g; # no tags
  my ($name, $description) = split /\s+-\s+/, $doc_title;

  my $content = $pod->content->present($self);
  my $toc = $self->make_toc($pod, 0);

  return <<__EOHTML__
<html>
<head>
  <link href="../lib/GvaScript.css" rel="stylesheet" type="text/css">
  <script src="../lib/prototype.js"></script>
  <script src="../lib/GvaScript.js"></script>
  <link href="GvaScript_doc.css" rel="stylesheet" type="text/css">
  <script>
    var treeNavigator;
    function setup() {  
      new GvaScript.TreeNavigator('TN_tree');
    }
    window.onload = setup;
    function jumpto_href(event) {
      var label = event.controller.label(event.target);
      if (label && label.tagName == "A") {
        label.focus();
        return Event.stopNone;
      }
    }
  </script>
</head>
<body>
<div id='TN_tree'>
  <div class="TN_node">
   <h1 class="TN_label">$name</h1>
   <div class="TN_content">
     <p><em>$description</em></p>
     <div class="TN_node"  onPing="jumpto_href">
       <h3 class="TN_label">Table of contents</h3>
       <div class="TN_content">
         $toc
       </div>
     </div>
     <hr/>
   </div>
  </div>
$content
</div>
</body>
</html>
__EOHTML__

}

# installing same method for view_head1, view_head2, etc.
BEGIN {
  for my $num (1..6) {
    no strict 'refs';
    *{"view_head$num"} = sub {
      my ($self, $item) = @_;
      my $title   = $item->title->present($self);
      my $id      = _title_to_id($title);
      my $content = $item->content->present($self);
      my $h_num   = $num + 1;
      return <<__EOHTML__
  <div class="TN_node" id="$id">
    <h$h_num class="TN_label">$title</h$h_num>
    <div class="TN_content">
      $content
    </div>
  </div>
__EOHTML__
    }
  }
}


sub make_toc_orig {
  my ($self, $item, $level) = @_;

  my @nodes;
  my $method = "head" . ($level + 1);
  my $sub_items = $item->$method;

  foreach my $sub_item (@$sub_items) {
    my $title    = $sub_item->title->present($self);
    my $id       = _title_to_id($title);

    my $node_html = qq{<a toc_node="$id">$title</a>}
                  . $self->make_toc($sub_item, $level + 1);
    push @nodes, $node_html;
  }
  my $html = join "", map {"<li>$_</li>"}  @nodes;
  return $html ? "<ul>$html</ul>" : "";
}

sub make_toc {
  my ($self, $item, $level) = @_;

  my @nodes;
  my $method = "head" . ($level + 1);
  my $sub_items = $item->$method;

  foreach my $sub_item (@$sub_items) {
    my $title    = $sub_item->title->present($self);
    my $id       = _title_to_id($title);

    my $node_content = $self->make_toc($sub_item, $level + 1);
    my $class = $node_content ? "TN_node" : "TN_leaf";
    my $node_html = <<__EOHTML__;
<div class="$class">
  <a class="TN_label" href="#$id">$title</a>
  <div class="TN_content">$node_content</div>
</div>
__EOHTML__

    push @nodes, $node_html;
  }
  my $html = join "", @nodes;
  return $html;
}

1;


