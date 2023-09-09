# Under MIT license, notice at the end of the file.

# Why?
# This script is useful for manipulating XML documents, whether existing or new,
# using a more Nix-like syntax and allowing easier transformation.
# Removing the need of embedding XML fragments.
# Currently used for configuring Openbox settings.
#
# How to use it?
# There are three functions exposed,
# notation examples can be found before each function definition:
#
# - createRoot, which simply creates a document with only the root node.
#   Type: createRoot :: String -> String? -> Path
#   Parameters:
#   - name: Tag name of the root node.
#   - ns:   Namespace of the document, null if namespaces are not used.
#   Returns: The path of the file where the document is written to.
#
# - createOrdered, which creates ordered subnodes under the given root.
#   Type: createOrdered :: { list :: [Any]; filepath :: Path; root :: String; useNs :: bool } -> Path
#   Parameters:
#   - list: List of subnodes in the ordered notation.
#   - filepath: File path of the document.
#   - root: Tag name of the root node.
#   - useNs: Whether a namespace is used.
#   Returns: The path of the file where the updated document is written to.
#
# - applyUnordered, which updates or creates unordered subnodes
#   under the given root.
#   Type: applyUnordered :: { set :: AttrSet; filepath :: Path; root :: String; useNs :: bool } -> Path
#   Parameters:
#   - set: Attrset of subnodes in the unordered notation.
#   - filepath: File path of the document.
#   - root: Tag name of the root node.
#   - useNs: Whether a namespace is used.
#   Returns: The path of the file where the updated document is written to.

{ lib, pkgs, ... }:

let
  # Short-hand for shell argument escape function.
  escape = lib.escapeShellArg;

  # Template for all commands, to be repeated to form a complete script.
  templateCommand = inner: ''xml="$(echo "$xml" | ${lib.getExe pkgs.xmlstarlet} edit ${inner})"'';

  # Prefixes path segments that are not attribute or text nodes with the default namespace.
  # Skip this step if useNs is false.
  prefixNamespace = path: useNs: lib.concatStringsSep "/" (
    if useNs
    then builtins.map (name:
      if lib.hasPrefix "@" name || lib.hasSuffix "()" name
      then name
      else "_:${name}") path
    else path
  );

  # Extracts the type of a literal value node name.
  getValueMeta = name: (
    if name == "text()"
    then { type = "text"; name = ""; }
    else if lib.hasPrefix "@" name
         then { type = "attr"; name = lib.removePrefix "@" name; }
         else throw ''
           Name of a literal value must either represent a text node (`text()`),
           or an attribute node (`@<...>`). Got `${name}` instead.
           Element text node shorthand has not been implemented,
           use `<...>."text()"` instead.
         ''
  );

  # Sub-command templates used for manipulating the document.
  deleteNode = xpath: templateCommand ''--delete ${escape xpath}'';
  insertSubnode = { xpath, type, name, value ? "" }: templateCommand ''
    --subnode ${escape xpath} --type ${type} \
    --name ${escape name} --value ${escape value}'';
  updateNode = xpath: value: templateCommand ''
    --update ${escape xpath} --value ${escape value}'';

  # Inserts unordered nodes recursively after creating the new parent node.
  insertNodeRecursive = parentXpath: nodeName: node: useNs: let
    # creates the parent node of the insertion using the externally tagged name
    createParent = [(insertSubnode {
      xpath = parentXpath;
      type = "elem";
      name = nodeName;
    })];
  in createParent ++ (lib.foldlAttrs (acc: memberName: value: let
      nodeXpath = "${parentXpath}/${prefixNamespace [ nodeName ] useNs}[last()]";
      subnodeCommands = [(
        # continue recursion if the value is a structure,
        # attrset is accepted as a special shorthand for single node insertion.
        if builtins.isAttrs value || builtins.isList value
        then builtins.map (item:
          insertNodeRecursive nodeXpath memberName item useNs
        ) (lib.flatten [ value ])
        else insertSubnode ({ xpath = nodeXpath; inherit value; } // getValueMeta memberName)
      )];
    in acc ++ subnodeCommands
  ) [ ] node);

  # Template for the entire operating shell script.
  updateXml = filepath: commands: pkgs.runCommand "xml-update" { } ''
    xml="$(cat ${escape filepath})"
    ${lib.concatStringsSep ";" commands}
    mkdir "$out/"
    echo "$xml" > "$out/temporary.xml"
  '' + "/temporary.xml";
in

{
  # Creates an XML root for subsequent manipulations,
  # as they do not work with an empty document.
  createRoot = name: ns: let
   nsAttr = if ns == null then "" else ''xmlns="${lib.escapeXML ns}"'';
  in builtins.toFile "xml-root" ''
    <?xml version="1.0" encoding="UTF-8"?>
    <${lib.escapeXML name} ${nsAttr}>
    </${lib.escapeXML name}>
  '';

  # Creates node under the specified root using the ordered notation.
  #   Notation example:
  #     Assuming that the root tag is "root",
  #     this expression in ordered notation:
  #         let entry = lib.nameValuePair; in [
  #           (entry "@alpha" "one")
  #           (entry "beta" [
  #             (entry "charlie" { "text()" = 2; })
  #             (entry "delta" { "@echo" = "three"; })
  #           ])
  #           (entry "foxtrot" [
  #             (entry "@golf" "four")
  #             (entry "text()" 5)
  #           ])
  #         ]
  #     will yield:
  #         <root alpha="one">
  #           <beta>
  #             <charlie>2</charlie>
  #             <delta echo="three"/>
  #           </beta>
  #           <foxtrot golf="four">5</foxtrot>
  #         </root>
  #     Expressions within attrsets are in the unordered notation from next
  #     section. The "foxtrot" node can indeed be expressed in that notation:
  #         (entry "foxtrot" { "@golf" = "four"; "text()" = 5; })
  createOrdered = { list, filepath, root, useNs }: let

    commands = nodeXpath: subnodeList: lib.flatten (builtins.map (subnode:
      # if the value is an attrset, enter unodered insertion mode.
      if builtins.isAttrs subnode.value
      then insertNodeRecursive nodeXpath subnode.name subnode.value useNs
      # recurse within new subnode, or insert literal value directly.
      else if builtins.isList subnode.value
           then [(insertSubnode {
             xpath = nodeXpath;
             type = "elem";
             name = subnode.name;
           })] ++ (commands
                   "${nodeXpath}/${prefixNamespace [ subnode.name ] useNs}[last()]"
                   subnode.value)
           else [(insertSubnode ({
             xpath = nodeXpath;
             value = subnode.value;
           } // getValueMeta subnode.name))]
    ) subnodeList);

  in updateXml filepath (commands (prefixNamespace [ root ] useNs) list);

  # Modifies existing nodes using the unordered notation.
  #   Notation exmaple:
  #     Assuming that the root tag is "root" and the node "charlie" already exists,
  #     with one attribute "delta" having the value "5".
  #     This expression in unordered notation:
  #         {
  #           alpha = [
  #             { "text()" = 1; }
  #             { "@beta" = "two"; }
  #           ];
  #           charlie = {
  #             "@delta" = "three";
  #             "echo" = [{ "text()" = 4; }];
  #           };
  #           "@foxtrot" = "five";
  #         }
  #     will yield:
  #         <root foxtrot="five">
  #           <alpha>1</alpha>
  #           <alpha beta="two"/>
  #           <charlie delta="three">
  #             <echo>4</echo>
  #           </charlie>
  #         </root>
  #     If a node should be inserted instead of updated, it must be enclosed in
  #     square brackets. Otherwise, the expression will be parsed as an update
  #     operation, and no action will be taken if there is no existing matching
  #     node.
  # (note that ordered notation can embed unordered notation, but not the other
  #  way around. If such technical detail is of interest, check out the
  #  section near the end of the file.)
  applyUnordered = { set, filepath, root, useNs }: let
    # composes XPaths for existing unordered nodes.
    xpathValuePairs = lib.collect builtins.isList (lib.mapAttrsRecursive
        (path: value: [ "/${prefixNamespace ([ root ] ++ path) useNs}" value ]) set);

    commands = lib.flatten (builtins.map (x: let
      xpath = builtins.elemAt x 0;
      splitXpath = lib.flatten (builtins.split "/" xpath);
      parentXpath = (lib.concatStringsSep "/" (lib.init splitXpath));
      name = lib.removePrefix "_:" (lib.last splitXpath);
      value = builtins.elemAt x 1;
    in
      # if the value is null, delete the node.
      if value == null
      then deleteNode xpath
      # if the value is a list, create the nodes.
      else if builtins.isList value
           then builtins.map (item: insertNodeRecursive parentXpath name item useNs) value
           else updateNode xpath value
    ) xpathValuePairs);

  in updateXml filepath commands;
}

# Technical detail
#
# Here lists some functionality decisions made in this script:
# 1. Text node identifier is verbose.
#    The syntax `name = "value"` was considered, but that will introduce
#    inconsistency with the syntax `[{ "text()" = "value" }]` as the square
#    bracket is required in this case and cannot be abbreviated. This also
#    conflicts with [2].
# 2. Unordered notation cannot transition to ordered notation.
#    There are multiple solutions to this, one can be adding a "type" tag
#    to ordered notation, which conflicts with [1] and adds complexity.
#    Alternatively, unordered notation can be changed so that single entry
#    insertion needs to be wrapped in square brackets. This looks ugly and
#    adds unneccessary noise.
# 3. Replacing all subnodes under a parent node is not possible.
#    This also conflicts with [1], as this will require an internal tag to
#    indicate replacement. Other solutions add complexity or noise to the
#    syntax.
# 4. XmlStarlet allows packing sub-commands into one command.
#    This is not implemented, as the current solution is easier to compose
#    and have no issues currently.

# MIT License
#
# Copyright (c) 2023 Yuen Tsang Yin
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
