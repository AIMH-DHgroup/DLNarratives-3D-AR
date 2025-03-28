// make draggable annotations
/*document.addEventListener("DOMContentLoaded", function () {
    const container = document.getElementById("annotations-container");

    let draggedElement = null;
    let placeholder = null;

    container.addEventListener("mousedown", (e) => {
        if (!e.target.classList.contains("annotation-item")) return;

        // Selected element
        draggedElement = e.target;
        draggedElement.classList.add("dragging");

        // Add a placeholder
        placeholder = document.createElement("div");
        placeholder.classList.add("annotation-item");
        placeholder.style.background = "#dcdcdc";
        placeholder.style.height = `${draggedElement.offsetHeight}px`;
        container.insertBefore(placeholder, draggedElement.nextSibling);

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    function onMouseMove(e) {
        e.preventDefault();

        // Move the element following the cursor
        draggedElement.style.position = "absolute";
        draggedElement.style.zIndex = "1000";
        draggedElement.style.left = `${e.pageX - draggedElement.offsetWidth / 2}px`;
        draggedElement.style.top = `${e.pageY - draggedElement.offsetHeight / 2}px`;

        // Find drop position
        const elements = Array.from(container.children).filter(
            (child) => child !== draggedElement && child !== placeholder
        );

        const nextElement = elements.find((child) => {
            const rect = child.getBoundingClientRect();
            return e.clientY < rect.top + rect.height / 2;
        });

        if (nextElement) {
            container.insertBefore(placeholder, nextElement);
        } else {
            container.appendChild(placeholder);
        }
    }

    function onMouseUp() {
        // Restore original status
        draggedElement.classList.remove("dragging");
        draggedElement.style.position = "";
        draggedElement.style.zIndex = "";
        draggedElement.style.left = "";
        draggedElement.style.top = "";

        // Place dragged element
        container.insertBefore(draggedElement, placeholder);
        placeholder.remove();
        placeholder = null;
        draggedElement = null;

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    }
});*/
