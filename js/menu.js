function initLeftMenu() {
    var menuRoot = document.querySelector(".menu_root");
    if (!menuRoot) return;

    menuRoot.addEventListener("click", onMenuRootClick);
}
function onMenuRootClick(event) {
    if (event.target.closest(".sub_menu a")) {
        return;
    }

    var clickedItem = event.target.closest(".left_item");
    if (!clickedItem) return;

    var subMenu = clickedItem.querySelector(".sub_menu");
    if (!subMenu) return;

    closeOtherItems(clickedItem);
    clickedItem.classList.toggle("open");
}
function closeOtherItems(currentItem) {
  var allItems = document.querySelectorAll(".left_item");
  for (var i = 0; i < allItems.length; i++) {
    if (allItems[i] !== currentItem) {
      allItems[i].classList.remove("open");
    }
  }
}
document.addEventListener("DOMContentLoaded", initLeftMenu);